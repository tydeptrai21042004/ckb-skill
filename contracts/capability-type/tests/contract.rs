use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_hash::new_blake2b,
    context::Context,
    ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::{CellInput, CellOutput, Script, Uint64},
        prelude::*,
    },
};
use std::{env, fs};

const MAX_CYCLES: u64 = 10_000_000;
const CAPACITY: u64 = 20_000_000_000;
const TRANSFERABLE: u8 = 1;
const SUBJECT_NONE: u8 = 0;
const SUBJECT_PRODUCT: u8 = 1;
const BINDING_HOLDER: u8 = 0;
const BINDING_SUBJECT_OWNER: u8 = 1;
const BINDING_ATOMIC: u8 = 2;
const BINDING_LICENSE: u8 = 3;

type H32 = [u8; 32];

struct Fixture {
    context: Context,
    cap_code: ckb_testtool::ckb_types::packed::OutPoint,
    owner_a: Script,
    owner_b: Script,
}

fn capability_data(flags: u8, service: H32, issuer: H32, cap_id: H32, expiry: u64) -> Bytes {
    let mut out = vec![0u8; 106];
    out[0] = 1;
    out[1] = flags;
    out[2..34].copy_from_slice(&service);
    out[34..66].copy_from_slice(&issuer);
    out[66..98].copy_from_slice(&cap_id);
    out[98..106].copy_from_slice(&expiry.to_le_bytes());
    out.into()
}

fn capability_data_v2(
    flags: u8,
    service: H32,
    issuer: H32,
    cap_id: H32,
    expiry: u64,
    subject_type: u8,
    binding_mode: u8,
    subject_id: H32,
    policy_hash: H32,
) -> Bytes {
    let mut out = vec![0u8; 172];
    out[0] = 2;
    out[1] = flags;
    out[2..34].copy_from_slice(&service);
    out[34..66].copy_from_slice(&issuer);
    out[66..98].copy_from_slice(&cap_id);
    out[98..106].copy_from_slice(&expiry.to_le_bytes());
    out[106] = subject_type;
    out[107] = binding_mode;
    out[108..140].copy_from_slice(&subject_id);
    out[140..172].copy_from_slice(&policy_hash);
    out.into()
}

fn valid_subject_bound_v2(issuer: H32, cap_id: H32) -> Bytes {
    capability_data_v2(
        TRANSFERABLE,
        [1u8; 32],
        issuer,
        cap_id,
        2_000_000_000,
        SUBJECT_PRODUCT,
        BINDING_SUBJECT_OWNER,
        [3u8; 32],
        [4u8; 32],
    )
}

fn setup() -> Fixture {
    let mut context = Context::default();
    let contract: Bytes = fs::read(env::var("CAPABILITY_BIN").expect("CAPABILITY_BIN set by make test"))
        .expect("read capability RISC-V binary")
        .into();
    let cap_code = context.deploy_cell(contract);

    // Two distinct always-success locks are sufficient for state-machine unit
    // tests. Real testnet transactions should use the wallet's real lock.
    let always_out = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let owner_a = context
        .build_script(&always_out, Bytes::from(vec![0xA1; 20]))
        .expect("owner A lock");
    let owner_b = context
        .build_script(&always_out, Bytes::from(vec![0xB2; 20]))
        .expect("owner B lock");

    Fixture { context, cap_code, owner_a, owner_b }
}

fn build_cap_type(fx: &Fixture, issuer_id: H32, capability_id: H32) -> Script {
    let mut args = Vec::with_capacity(64);
    args.extend_from_slice(&issuer_id);
    args.extend_from_slice(&capability_id);
    fx.context
        .build_script(&fx.cap_code, Bytes::from(args))
        .expect("capability type")
}

fn hash32(script: &Script) -> H32 {
    let packed = script.calc_script_hash();
    let mut out = [0u8; 32];
    out.copy_from_slice(packed.as_slice());
    out
}

fn create_input(context: &mut Context, lock: Script, type_: Option<Script>, data: Bytes) -> CellInput {
    let out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY.pack())
            .lock(lock)
            .type_(type_.pack())
            .build(),
        data,
    );
    CellInput::new_builder().previous_output(out_point).build()
}

fn output(lock: Script, type_: Option<Script>) -> CellOutput {
    CellOutput::new_builder()
        .capacity(CAPACITY.pack())
        .lock(lock)
        .type_(type_.pack())
        .build()
}

/// Same creation formula used by CKB Type ID: hash(serialized first input ||
/// packed output index). The protocol embeds this value as the last 32 bytes
/// of Capability Type Script args.
fn creation_id(first_input: &CellInput, output_index: u64) -> H32 {
    let packed_index: Uint64 = output_index.pack();
    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(packed_index.as_slice());
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

#[test]
fn valid_issue_succeeds_with_type_id_style_identity_and_issuer_input() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("issuer-authorized issue");
}

#[test]
fn provider_can_issue_directly_to_a_different_recipient() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);

    // Provider/issuer A authorizes and funds creation, while recipient B becomes
    // the first owner. The contract binds issuer authority to transaction inputs
    // and ownership to the output lock, so these roles do not need to be equal.
    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("provider -> recipient issuance");
}

#[test]
fn creation_uses_absolute_transaction_output_index() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 1);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), None))
        .output_data(Bytes::new().pack())
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("output index 1 must be hashed");
}

#[test]
fn forged_creation_id_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let forged = [9u8; 32];
    assert_ne!(forged, creation_id(&funding_input, 0));
    let cap_type = build_cap_type(&fx, issuer, forged);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, forged, 2_000_000_000);

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn issue_without_issuer_input_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let foreign_input = create_input(&mut fx.context, fx.owner_b.clone(), None, Bytes::new());
    let cap_id = creation_id(&foreign_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);

    let tx = TransactionBuilder::default()
        .input(foreign_input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn unsupported_version_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let mut data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000).to_vec();
    data[0] = 2;

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(Bytes::from(data).pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn unknown_flag_bit_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(0b1000_0000, [1u8; 32], issuer, cap_id, 2_000_000_000);

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn valid_transfer_succeeds() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), data.clone());

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("valid transfer");
}

#[test]
fn changing_service_id_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let before = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);
    let after = capability_data(TRANSFERABLE, [2u8; 32], issuer, cap_id, 2_000_000_000);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), before);

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(after.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn changing_issuer_id_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let before = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);
    let after = capability_data(TRANSFERABLE, [1u8; 32], [7u8; 32], cap_id, 2_000_000_000);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), before);

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(after.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn non_transferable_owner_change_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(0, [1u8; 32], issuer, cap_id, 2_000_000_000);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), data.clone());

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn malformed_data_fails() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let malformed = Bytes::from(vec![0u8; 10]);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), malformed.clone());

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(malformed.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn burn_is_forbidden() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data(TRANSFERABLE, [1u8; 32], issuer, cap_id, 2_000_000_000);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type), data);

    let tx = TransactionBuilder::default().input(input).build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}


#[test]
fn valid_v2_issue_succeeds() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = valid_subject_bound_v2(issuer, cap_id);

    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("valid v2 issue");
}

#[test]
fn valid_v2_transfer_succeeds_and_preserves_all_binding_fields() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = valid_subject_bound_v2(issuer, cap_id);
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), data.clone());

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    fx.context.verify_tx(&tx, MAX_CYCLES).expect("valid v2 transfer");
}

fn assert_v2_mutation_fails(offset: usize, value: u8) {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let before = valid_subject_bound_v2(issuer, cap_id);
    let mut after = before.to_vec();
    after[offset] = value;
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), before);

    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_b.clone(), Some(cap_type)))
        .output_data(Bytes::from(after).pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn v2_subject_type_is_immutable() {
    assert_v2_mutation_fails(106, 2);
}

#[test]
fn v2_binding_mode_is_immutable() {
    assert_v2_mutation_fails(107, BINDING_ATOMIC);
}

#[test]
fn v2_subject_id_is_immutable() {
    assert_v2_mutation_fails(108, 0x55);
}

#[test]
fn v2_policy_hash_is_immutable() {
    assert_v2_mutation_fails(140, 0x66);
}

#[test]
fn v2_non_holder_binding_requires_subject() {
    for binding_mode in [BINDING_SUBJECT_OWNER, BINDING_ATOMIC, BINDING_LICENSE] {
        let mut fx = setup();
        let issuer = hash32(&fx.owner_a);
        let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
        let cap_id = creation_id(&funding_input, 0);
        let cap_type = build_cap_type(&fx, issuer, cap_id);
        let data = capability_data_v2(
            TRANSFERABLE,
            [1u8; 32],
            issuer,
            cap_id,
            2_000_000_000,
            SUBJECT_NONE,
            binding_mode,
            [0u8; 32],
            [4u8; 32],
        );
        let tx = TransactionBuilder::default()
            .input(funding_input)
            .output(output(fx.owner_a.clone(), Some(cap_type)))
            .output_data(data.pack())
            .build();
        let tx = fx.context.complete_tx(tx);
        assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
    }
}

#[test]
fn v2_subject_type_and_subject_id_must_be_consistent() {
    let cases = [
        (SUBJECT_NONE, [7u8; 32]),
        (SUBJECT_PRODUCT, [0u8; 32]),
    ];
    for (subject_type, subject_id) in cases {
        let mut fx = setup();
        let issuer = hash32(&fx.owner_a);
        let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
        let cap_id = creation_id(&funding_input, 0);
        let cap_type = build_cap_type(&fx, issuer, cap_id);
        let data = capability_data_v2(
            TRANSFERABLE,
            [1u8; 32],
            issuer,
            cap_id,
            2_000_000_000,
            subject_type,
            BINDING_HOLDER,
            subject_id,
            [4u8; 32],
        );
        let tx = TransactionBuilder::default()
            .input(funding_input)
            .output(output(fx.owner_a.clone(), Some(cap_type)))
            .output_data(data.pack())
            .build();
        let tx = fx.context.complete_tx(tx);
        assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
    }
}

#[test]
fn v2_rejects_binding_mode_outside_supported_range() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
    let cap_id = creation_id(&funding_input, 0);
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let data = capability_data_v2(
        TRANSFERABLE,
        [1u8; 32],
        issuer,
        cap_id,
        2_000_000_000,
        SUBJECT_PRODUCT,
        BINDING_LICENSE + 1,
        [3u8; 32],
        [4u8; 32],
    );
    let tx = TransactionBuilder::default()
        .input(funding_input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(data.pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn v2_wrong_length_is_rejected() {
    let mut fx = setup();
    let issuer = hash32(&fx.owner_a);
    let cap_id = [9u8; 32];
    let cap_type = build_cap_type(&fx, issuer, cap_id);
    let mut malformed = valid_subject_bound_v2(issuer, cap_id).to_vec();
    malformed.pop();
    let input = create_input(&mut fx.context, fx.owner_a.clone(), Some(cap_type.clone()), Bytes::from(malformed.clone()));
    let tx = TransactionBuilder::default()
        .input(input)
        .output(output(fx.owner_a.clone(), Some(cap_type)))
        .output_data(Bytes::from(malformed).pack())
        .build();
    let tx = fx.context.complete_tx(tx);
    assert!(fx.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn valid_v2_supported_binding_modes_issue() {
    for (binding_mode, subject_type, subject_id) in [
        (BINDING_HOLDER, SUBJECT_NONE, [0u8; 32]),
        (BINDING_SUBJECT_OWNER, SUBJECT_PRODUCT, [3u8; 32]),
        (BINDING_ATOMIC, SUBJECT_PRODUCT, [3u8; 32]),
        (BINDING_LICENSE, SUBJECT_PRODUCT, [3u8; 32]),
    ] {
        let mut fx = setup();
        let issuer = hash32(&fx.owner_a);
        let funding_input = create_input(&mut fx.context, fx.owner_a.clone(), None, Bytes::new());
        let cap_id = creation_id(&funding_input, 0);
        let cap_type = build_cap_type(&fx, issuer, cap_id);
        let data = capability_data_v2(
            TRANSFERABLE,
            [1u8; 32],
            issuer,
            cap_id,
            2_000_000_000,
            subject_type,
            binding_mode,
            subject_id,
            [4u8; 32],
        );
        let tx = TransactionBuilder::default()
            .input(funding_input)
            .output(output(fx.owner_a.clone(), Some(cap_type)))
            .output_data(data.pack())
            .build();
        let tx = fx.context.complete_tx(tx);
        fx.context.verify_tx(&tx, MAX_CYCLES).expect("supported v2 binding mode must issue");
    }
}

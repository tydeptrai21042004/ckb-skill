#![no_std]
#![no_main]

use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::*},
    default_alloc,
    entry,
    error::SysError,
    high_level::{load_cell_data, load_cell_lock_hash, load_script, QueryIter},
    type_id::validate_type_id,
};

default_alloc!();
entry!(program_entry);

const DATA_LEN_V1: usize = 106;
const DATA_LEN_V2: usize = 172;
const ARGS_LEN: usize = 64;
const VERSION_V1: u8 = 1;
const VERSION_V2: u8 = 2;
const SUBJECT_NONE: u8 = 0;
const BINDING_HOLDER: u8 = 0;
const BINDING_LICENSE: u8 = 3;
const FLAG_TRANSFERABLE: u8 = 1 << 0;
const KNOWN_FLAGS_MASK: u8 = (1 << 0) | (1 << 1) | (1 << 2);

#[repr(i8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    MalformedData = 5,
    UnsupportedVersion = 6,
    UnknownFlags = 7,
    InvalidArgs = 8,
    IdentityMismatch = 9,
    MissingIssuerAuthorization = 10,
    ImmutableFieldChanged = 11,
    TransferForbidden = 12,
    InvalidGroupShape = 13,
    BurnForbidden = 14,
    InvalidCreationId = 15,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound => Error::IndexOutOfBound,
            SysError::ItemMissing => Error::ItemMissing,
            SysError::LengthNotEnough(_) => Error::LengthNotEnough,
            SysError::Encoding => Error::Encoding,
            _ => Error::Encoding,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CapabilityData {
    version: u8,
    flags: u8,
    service_id: [u8; 32],
    issuer_id: [u8; 32],
    capability_id: [u8; 32],
    expiry: u64,
}

fn copy32(data: &[u8], start: usize) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(&data[start..start + 32]);
    out
}

fn parse_capability(data: &[u8]) -> Result<CapabilityData, Error> {
    if data.is_empty() {
        return Err(Error::MalformedData);
    }
    match data[0] {
        VERSION_V1 if data.len() == DATA_LEN_V1 => {}
        VERSION_V2 if data.len() == DATA_LEN_V2 => {}
        VERSION_V1 | VERSION_V2 => return Err(Error::MalformedData),
        _ => return Err(Error::UnsupportedVersion),
    }
    if data[1] & !KNOWN_FLAGS_MASK != 0 {
        return Err(Error::UnknownFlags);
    }
    if data[0] == VERSION_V2 {
        let subject_type = data[106];
        let binding_mode = data[107];
        if binding_mode > BINDING_LICENSE {
            return Err(Error::MalformedData);
        }
        let subject_is_zero = data[108..140].iter().all(|byte| *byte == 0);
        if (subject_type == SUBJECT_NONE) != subject_is_zero {
            return Err(Error::MalformedData);
        }
        if binding_mode != BINDING_HOLDER && subject_type == SUBJECT_NONE {
            return Err(Error::MalformedData);
        }
    }

    let mut expiry_bytes = [0u8; 8];
    expiry_bytes.copy_from_slice(&data[98..106]);

    Ok(CapabilityData {
        version: data[0],
        flags: data[1],
        service_id: copy32(data, 2),
        issuer_id: copy32(data, 34),
        capability_id: copy32(data, 66),
        expiry: u64::from_le_bytes(expiry_bytes),
    })
}

fn load_args() -> Result<([u8; 32], [u8; 32]), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();
    if args.len() != ARGS_LEN {
        return Err(Error::InvalidArgs);
    }
    Ok((copy32(args.as_ref(), 0), copy32(args.as_ref(), 32)))
}

fn enforce_identity(
    cap: &CapabilityData,
    issuer_arg: &[u8; 32],
    capability_arg: &[u8; 32],
) -> Result<(), Error> {
    if &cap.issuer_id != issuer_arg || &cap.capability_id != capability_arg {
        return Err(Error::IdentityMismatch);
    }
    Ok(())
}

/// Validates the capability_id half of args using ckb-std's official
/// Type-ID creation rule. Keeping this delegated to ckb-std avoids duplicating
/// the consensus-facing hash construction in this contract.
fn verify_creation_id(capability_arg: &[u8; 32]) -> Result<(), Error> {
    validate_type_id(capability_arg).map_err(|_| Error::InvalidCreationId)
}

fn verify_issue(
    output: &[u8],
    issuer_arg: &[u8; 32],
    capability_arg: &[u8; 32],
) -> Result<(), Error> {
    let cap = parse_capability(output)?;
    enforce_identity(&cap, issuer_arg, capability_arg)?;
    verify_creation_id(capability_arg)?;

    // Issuance requires at least one transaction input whose lock script hash
    // equals issuer_id. The normal CKB lock script proves control of that input.
    let issuer_authorized = QueryIter::new(load_cell_lock_hash, Source::Input)
        .any(|lock_hash| lock_hash == *issuer_arg);
    if !issuer_authorized {
        return Err(Error::MissingIssuerAuthorization);
    }
    Ok(())
}

fn verify_transition(
    input: &[u8],
    output: &[u8],
    issuer_arg: &[u8; 32],
    capability_arg: &[u8; 32],
) -> Result<(), Error> {
    let before = parse_capability(input)?;
    let after = parse_capability(output)?;
    enforce_identity(&before, issuer_arg, capability_arg)?;
    enforce_identity(&after, issuer_arg, capability_arg)?;

    // Capability data is immutable during transfer for both v1 and v2.
    // For v2 this also protects subject binding and policy commitments.
    if input != output || before != after {
        return Err(Error::ImmutableFieldChanged);
    }

    let input_lock = load_cell_lock_hash(0, Source::GroupInput)?;
    let output_lock = load_cell_lock_hash(0, Source::GroupOutput)?;
    if input_lock != output_lock && before.flags & FLAG_TRANSFERABLE == 0 {
        return Err(Error::TransferForbidden);
    }
    Ok(())
}

fn main() -> Result<(), Error> {
    let input_count = QueryIter::new(load_cell_data, Source::GroupInput).count();
    let output_count = QueryIter::new(load_cell_data, Source::GroupOutput).count();
    let (issuer_arg, capability_arg) = load_args()?;

    match (input_count, output_count) {
        (0, 1) => {
            let output = load_cell_data(0, Source::GroupOutput)?;
            verify_issue(output.as_ref(), &issuer_arg, &capability_arg)
        }
        (1, 1) => {
            let input = load_cell_data(0, Source::GroupInput)?;
            let output = load_cell_data(0, Source::GroupOutput)?;
            verify_transition(input.as_ref(), output.as_ref(), &issuer_arg, &capability_arg)
        }
        (1, 0) => Err(Error::BurnForbidden),
        _ => Err(Error::InvalidGroupShape),
    }
}

pub fn program_entry() -> i8 {
    match main() {
        Ok(()) => 0,
        Err(err) => err as i8,
    }
}

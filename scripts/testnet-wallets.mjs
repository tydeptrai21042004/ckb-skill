/**
 * Disposable CKB Pudge Testnet CI wallet. NOT FOR MAINNET OR REAL VALUE.
 * The signing key is intentionally committed as requested; it is PUBLIC.
 * Anyone reading this repository can spend all CKB sent to Alice.
 * This is only suitable for throwaway funded testnet demos.
 */
export const TESTNET_NETWORK = "ckb_testnet";
export const TESTNET_RPC_DEFAULT = "https://testnet.ckb.dev";
export const TESTNET_RPC_SECONDARY = "https://testnet.ckbapp.dev";
export const TESTNET_FUNDING_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqd8xp30mcsysa6psxaxzzugf2tlntyg78cg0agsy";
export const TESTNET_BOB_ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdtdfshkjmg5erflrg7yp4s37u38uhddls4fudnz";

/** PUBLIC disposable testnet key — never use for mainnet funds. */
export const TESTNET_FUNDING_PRIVATE_KEY = "0x55fac0c004109c77b05ee175a1a24a2fb352a05f1b5e2afe4ccfe17e44ca2ec0";

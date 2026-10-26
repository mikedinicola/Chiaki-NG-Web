// SPDX-License-Identifier: LicenseRef-AGPL-3.0-only-OpenSSL
#include <chiaki/rpcrypt.h>
#include <chiaki/ecdh.h>
#include <mbedtls/md.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>

int __real_mbedtls_md_hmac_finish(mbedtls_md_context_t *ctx, unsigned char *output);

/* The library archives are not ASan-instrumented. Copy their full SHA-256
 * result through an instrumented boundary so an undersized caller allocation
 * is detected rather than hidden inside a prebuilt archive. */
int __wrap_mbedtls_md_hmac_finish(mbedtls_md_context_t *ctx, unsigned char *output)
{
    unsigned char digest[32];
    int result = __real_mbedtls_md_hmac_finish(ctx, digest);
    if(result == 0)
        memcpy(output, digest, sizeof(digest));
    return result;
}

int main(void)
{
    /* Existing upstream PS5 registration IV vector, test/rpcrypt.c. */
    const uint8_t ambassador[] = {0x3e,0x7e,0x7a,0x82,0x59,0x73,0xad,0xab,0x2f,0x69,0x43,0x46,0xbd,0x44,0xda,0xb5};
    const uint8_t expected[] = {0x90,0x44,0x40,0x82,0x73,0xf8,0x04,0x4d,0xca,0x76,0x7b,0x5a,0x16,0x39,0x4d,0x64};
    ChiakiRPCrypt crypt;
    uint8_t iv[16];
    assert(chiaki_rpcrypt_init_regist(&crypt, CHIAKI_TARGET_PS5_1, ambassador, 0, 0) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_rpcrypt_generate_iv(&crypt, iv, 0) == CHIAKI_ERR_SUCCESS);
    assert(memcmp(iv, expected, sizeof(iv)) == 0);

    /* Independently published upstream encryption vector, test/rpcrypt.c. */
    const uint8_t nonce[] = {0x43,0x09,0x67,0xae,0x36,0x4b,0x1c,0x45,0x26,0x62,0x37,0x7a,0xbf,0x3f,0xe9,0x39};
    const uint8_t morning[] = {0xd2,0x78,0x9f,0x51,0x85,0xa7,0x99,0xa2,0x44,0x52,0x77,0x9c,0x2b,0x83,0xcf,0x07};
    uint8_t data[] = {0x13,0x37,0xc0,0xff,0xee};
    const uint8_t cipher[] = {0x40,0x48,0x63,0xeb,0xb4};
    chiaki_rpcrypt_init_auth(&crypt, CHIAKI_TARGET_PS4_9, nonce, morning);
    assert(chiaki_rpcrypt_encrypt(&crypt, 0x0102030405060708ULL, data, data, sizeof(data)) == CHIAKI_ERR_SUCCESS);
    assert(memcmp(data, cipher, sizeof(data)) == 0);
    ChiakiECDH alice, bob;
    uint8_t alice_pub[65], bob_pub[65], alice_sig[32], bob_sig[32];
    uint8_t alice_secret[32], bob_secret[32], handshake[16] = {0};
    size_t alice_pub_size = 65, bob_pub_size = 65, alice_sig_size = 32, bob_sig_size = 32;
    assert(chiaki_ecdh_init(&alice) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_ecdh_init(&bob) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_ecdh_get_local_pub_key(&alice, alice_pub, &alice_pub_size, handshake, alice_sig, &alice_sig_size) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_ecdh_get_local_pub_key(&bob, bob_pub, &bob_pub_size, handshake, bob_sig, &bob_sig_size) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_ecdh_derive_secret(&alice, alice_secret, bob_pub, bob_pub_size, handshake, bob_sig, bob_sig_size) == CHIAKI_ERR_SUCCESS);
    assert(chiaki_ecdh_derive_secret(&bob, bob_secret, alice_pub, alice_pub_size, handshake, alice_sig, alice_sig_size) == CHIAKI_ERR_SUCCESS);
    assert(memcmp(alice_secret, bob_secret, 32) == 0);
    memset(bob_pub, 0, sizeof(bob_pub));
    assert(chiaki_ecdh_derive_secret(&alice, alice_secret, bob_pub, bob_pub_size, handshake, bob_sig, bob_sig_size) != CHIAKI_ERR_SUCCESS);
    chiaki_ecdh_fini(&alice); chiaki_ecdh_fini(&bob);
    puts("WASM registration/encryption vectors and ECDH exchange passed");
    return 0;
}

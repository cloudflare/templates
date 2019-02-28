import jose from 'node-jose';

/**
 * Generate a Google Cloud API JWT
 *
 * @param config - the JWT configuration
 */
export default async function generateJWT(config) {
  const iat = new Date().getTime() / 1000;
  let payload = {
    ...config.payload,
    iat: iat,
    exp: iat + 3600
  };

  const signingKey = await jose.JWK.asKey(
    config.privateKey.replace(/\\n/g, '\n'),
    'pem'
  );

  const sign = await jose.JWS.createSign(
    { fields: { alg: config.algorithm, kid: config.privateKeyID } },
    signingKey
  )
    .update(JSON.stringify(payload), 'utf8')
    .final();

  const signature = sign.signatures[0];
  return [signature.protected, sign.payload, signature.signature].join('.');
}


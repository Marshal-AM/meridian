Seaport Validator Development Access

To access Ledger API for deployment DAR, create contract, query ACS, fetch ledger update etc
you will need to access Ledger API.

Ledger REST endpoint

https://ledger-api.validator.devnet.sandbox.fivenorth.io/

Ledger WebSocket endpoint

wss://ledger-api.validator.devnet.sandbox.fivenorth.io

Auth Token

To access Ledger API, you need a JWT token. The token can be exchanged by providing OIDC
client id/secret as below:

- Client ID: `validator-devnet-m2m`
- Client Secret: set in repo-root `.env` as `DEVNET_CLIENT_SECRET` (copy from `.env.example`)

Exchange for an access token:

```bash
curl -X POST 'https://auth.sandbox.fivenorth.io/application/o/token/' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials' \
  --data 'client_id=validator-devnet-m2m' \
  --data "client_secret=$DEVNET_CLIENT_SECRET" \
  --data 'audience=validator-devnet-m2m' \
  --data 'scope=daml_ledger_api'
```

You will then get an `access_token` in the response. This access token expires
every 8 hours, so code your app in a way to detect and refresh this.

Access Ledger API

Http Rest API

https://ledger-api.validator.devnet.sandbox.fivenorth.io/

Then now you can make request to ledger and passing the access token as Bearer

Example to access Ledger End

```bash
curl -X GET 'https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/state/ledger-end' \
  --header "Authorization: Bearer <token>"
```

Websocket API

You can re-use same URL endpoint, using the same access token but with this format

```bash
wscat -w -1 --connect \
  'wss://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/state/active-contracts' \
  -s 'jwt.token.<token>' -s 'daml.ws.auth'
```

You can adapt to any websocket library. The `-s` is the subprotocol of websocket. When coding,
make sure the ordering is correct.

## Funding parties with Canton Coin (DevNet Tap)

After party allowlisting, fund each persona with CC using the repo script (wraps `@canton-network/wallet-sdk` `amulet.tap`):

```bash
pnpm fund:devnet
```

Configure in `.env`:

- `DEVNET_VALIDATOR_URL` — Seaport validator API (default: `https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator`)
- `DEVNET_TAP_AMOUNT` — CC per party (default: `10000`)

If tap fails with permission errors, confirm with 5North that **Amulet Tap is enabled** on Seaport for your allowlisted parties.

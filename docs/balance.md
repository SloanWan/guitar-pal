# `npm run balance`

What is left on the accounts of the model vendors the evals use, in one table
(#430). It reads the keys in `.env.local` and asks each vendor's own billing
API. It never prints a key: an error row has every key cut out.

```bash
npm run balance             # the table
npm run balance -- --json   # the same rows as JSON
```

A row per vendor:

- **Left**: the balance, in the vendor's currency.
- **set … to check**: the variables that vendor needs are not in `.env.local`.
- **error**: the vendor's own message, on one line, with a link to its console.
- **unverified endpoint**: the figures came back, but this vendor's adapter has
  not yet been checked against a real account. Compare the first reading with
  the vendor's console, then set `verified: true` on its `VendorCheck`.

## Bracketing a paid run

A run's cost is otherwise estimated from token counts and a price table. To
see what the vendor actually charged, take the balance before and after:

```bash
npm run balance -- --json > /tmp/before.json
npm run evals                       # or any paid run
npm run balance -- --json > /tmp/after.json
```

The difference in **Left** is what the run cost. That holds when nothing else
spends on the same account meanwhile. Vendors bill with a delay of seconds to
minutes, so wait a little before the second reading.

## Vendors

| Vendor | Variables | Reads | Checked against a real account |
|---|---|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` | balance per currency | yes (2026-11-02) |
| Alibaba Cloud (Bailian) | `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | the whole account's balance, which Bailian bills from | yes (2026-11-02) |

Alibaba Cloud's signature is unit tested against the worked example in the
cloud's signing guide; a RAM user holding only the policy below read the
account's balance.

A model key is not a billing key: `DASHSCOPE_API_KEY` calls Bailian's models
only, and the balance needs the AccessKey pair below.

## A read-only AccessKey

Never use the root account's key. Make a sub-account that can read the
balance and nothing else. Skip the RAM console's quick-start templates (the
first, the "super user" for programs, can spend and delete): Permissions →
Policies → create a policy with the JSON below; Identities → Users → create a
user with permanent AccessKey (OpenAPI) access only → grant it that policy
alone.

```json
{"Version":"1","Statement":[{"Effect":"Allow","Action":"bss:DescribeAcccount","Resource":"*"}]}
```

(Alibaba spells the action with three c's.)

## Adding a vendor

Add one only when an eval starts calling it. One `VendorCheck` in
`src/lib/balance/vendors/`:

- `read` turns the vendor's answer into rows;
- the parser is tested on the vendor's documented response sample;
- a request signature is tested against the vendor's documented worked example;
- the vendor goes into `VENDORS`.

No live call runs in `npm test`.

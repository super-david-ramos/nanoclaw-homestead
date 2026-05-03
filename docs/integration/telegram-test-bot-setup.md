# Telegram test bot — registration guide

Setup instructions for the credentials needed to drive an automated end-to-end
test against a sandbox Telegram bot (Option B in the integration-testing plan).
Option A (manual sandbox playground) is wired and doesn't need any of these —
this document is a prerequisite for the *automated* harness.

## Why this is its own document

Three of the four credentials require interactive human steps Telegram won't
let an agent perform — you log into Telegram with a phone number, get an SMS
code, click through `my.telegram.org`, etc. This guide is for you to walk
through when you decide the harness is worth building.

## When to actually do this

Honest threshold: **don't build the Telethon harness until you have ~10+
distinct end-to-end scenarios you'd otherwise re-run by hand**. Below that
bar, the maintenance overhead (flaky network, occasional Telegram anti-spam
flags, auth-refresh ceremony) costs more than it saves vs. eyeballing
BarnabyTest manually.

Per-scenario value of automation also depends on what kind of bug an
end-to-end test would catch that unit tests can't:
- channel adapter wiring regressions
- prompt-template changes that quietly break agent behavior
- container-respawn invariants
- voice round-trip
- multi-user routing (only useful once a test *group* exists, not a DM)

## What you'll have at the end

Three new OneCLI vault entries, plus one decision recorded in this doc:

| Vault key | What it is | How it's used |
|---|---|---|
| `TELEGRAM_TEST_BOT_TOKEN` | Bot API token from BotFather | Already done. The bot under test. |
| `TELEGRAM_USER_API_ID` | Integer from `my.telegram.org` | Telethon client app credential |
| `TELEGRAM_USER_API_HASH` | 32-char hex from `my.telegram.org` | Telethon client app credential |
| `TELEGRAM_USER_SESSION_STRING` | Long base64-ish string | Telethon-impersonated user identity |

Plus this doc gets a `Decision` section noting whether you went test DC or prod
DC.

## Step 0 — Pick: test DC or prod DC

Recommendation: **test DC**, unless you have a specific reason to use prod.

| | Test DC | Prod DC |
|---|---|---|
| Sandboxed from real account | ✅ | ❌ |
| Anti-spam risk to real account | None | Marginal but real |
| Bot already created | ❌ — re-create | ✅ — `@barnaby_nano_test_bot` |
| Test data persistence | Wiped on irregular cadence (a feature) | Persisted indefinitely |
| Phone number requirement | Same — you sign in with a phone number | Same |

**If test DC**: re-create the bot via test DC's BotFather (separate from prod
BotFather). The current `@barnaby_nano_test_bot` becomes orphaned. The Bot
API URL changes — append `/test` to `https://api.telegram.org/bot<token>` →
`https://api.telegram.org/bot<token>/test/<method>`. Telethon needs to be
configured to use test DC servers (see step 4).

**If prod DC**: keep `@barnaby_nano_test_bot` and the existing
`TELEGRAM_TEST_BOT_TOKEN`. Use a Telegram user account that's NOT your daily
driver — burner SIM, Google Voice, family member's spare line, anything
isolated from your real identity. The "automating your real account → losing
real account" failure mode is the one to avoid.

> **Decide here, write your choice into [Decision](#decision) at the bottom.**

## Step 1 — Get a test Telegram user account

The Telethon harness impersonates a *user*, not a bot — Bot API can't initiate
DMs to bots; only users can. So you need a real Telegram user identity.

**Phone number**: any number you control that's not on your daily-driver
account. Options in order of cleanliness:
1. Spare physical SIM
2. Google Voice / virtual number
3. Family member's number (with consent — they'll receive the SMS code at
   first sign-in)
4. Test DC's shared `99966X1XXX` numbers — but those *cannot create bots* via
   BotFather, so only useful if you went test DC AND created the bot from a
   real number first

Sign up to Telegram via the official app on your phone using this number.
Set 2FA + a recovery email so a stolen session can't lock you out. Don't
join any chats — keep the account empty.

## Step 2 — Get `api_id` + `api_hash` from `my.telegram.org`

1. Open `https://my.telegram.org` in a browser.
2. Sign in with the test account's phone number (you'll get an SMS).
3. Click "API development tools".
4. Fill out the "Create new application" form:
   - **App title**: anything (e.g. `nanoclaw-test-harness`)
   - **Short name**: anything (e.g. `nanoclaw_test`)
   - **Platform**: Other
5. You'll see `api_id` (an integer) and `api_hash` (a 32-char hex string).

These are credentials for the *Telethon client app*, not the Telegram user
account. They can be revoked + reissued from the same page. Treat them as
secret but recoverable.

## Step 3 — Generate a `StringSession`

This is the credential that proves the Telethon client is *that user*.
Generate it once, interactively, on your machine. Save the output via OneCLI
— never paste it into a chat or commit it to a repo.

In a terminal (bash/zsh):

```bash
python3 -m venv /tmp/telethon-setup
source /tmp/telethon-setup/bin/activate
pip install telethon

python3 << 'PY'
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id   = int(input('api_id: '))
api_hash = input('api_hash: ').strip()

# For prod DC: this works as-is.
# For test DC: uncomment the two lines below.
# import telethon
# telethon.helpers.IS_TEST_DC = True   # not actually a real flag — see test DC note below

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print()
    print('SESSION STRING (treat as password):')
    print('--- begin ---')
    print(client.session.save())
    print('--- end ---')
PY

deactivate
rm -rf /tmp/telethon-setup
```

Telethon will prompt:
- Phone number: enter your test account's number with country code (e.g. `+15551234567`)
- Code: enter the SMS code Telegram sends
- 2FA password: if set

Output: a long string between `--- begin ---` and `--- end ---`. Copy it.

### Test DC variant

If you went test DC, Telethon needs different server endpoints. Don't use
the snippet above — instead:

```python
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id   = int(input('api_id: '))
api_hash = input('api_hash: ').strip()

client = TelegramClient(
    StringSession(), api_id, api_hash,
    # Test DC server:
    # See https://docs.telethon.dev/en/stable/concepts/sessions.html#string-sessions
)
client.session.set_dc(2, '149.154.167.40', 443)  # DC2, test cluster
client.start()
print(client.session.save())
client.disconnect()
```

(Test DC's IPs are stable enough but check Telethon docs if this stops
working.)

## Step 4 — Store credentials in OneCLI

In a terminal (NOT in a chat session that gets logged):

```bash
onecli secrets create --name TELEGRAM_USER_API_ID \
  --type generic --value '<api_id>' \
  --host-pattern api.telegram.org --header-name X-NanoClaw-Vault-Only

onecli secrets create --name TELEGRAM_USER_API_HASH \
  --type generic --value '<api_hash>' \
  --host-pattern api.telegram.org --header-name X-NanoClaw-Vault-Only

onecli secrets create --name TELEGRAM_USER_SESSION_STRING \
  --type generic --value '<session-string>' \
  --host-pattern api.telegram.org --header-name X-NanoClaw-Vault-Only
```

The `--header-name` is a placeholder — OneCLI's `generic` type requires it
but the test harness will read these via `onecli secrets get` (vault-mode),
not via HTTP injection. Same workaround as `TELEGRAM_TEST_BOT_TOKEN`.

Verify:

```bash
onecli secrets list | grep TELEGRAM_USER
```

You should see three entries with previews like `1234••••••••5678`.

## Step 5 — DM `@barnaby_nano_test_bot` from the test user account

The bot can't message a user it's never been DM'd by. From your test user
account (logged into the Telegram app on your phone, OR via Telethon once
the credentials work), send any message to `@barnaby_nano_test_bot`.

This populates Telegram's "I have permission to DM this user" state on the
bot's side. After this, the bot can sendMessage to that chat anytime.

## What the harness will then look like (for context)

The actual harness code isn't built yet — when you decide to build it, the
shape will be roughly:

```python
import pytest
from telethon import TelegramClient
from telethon.sessions import StringSession

@pytest.fixture(scope='session')
async def user_client():
    api_id = int(get_onecli_secret('TELEGRAM_USER_API_ID'))
    api_hash = get_onecli_secret('TELEGRAM_USER_API_HASH')
    session = get_onecli_secret('TELEGRAM_USER_SESSION_STRING')
    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.start()
    yield client
    await client.disconnect()

@pytest.mark.asyncio
async def test_barnaby_responds_to_hi(user_client):
    async with user_client.conversation('@barnaby_nano_test_bot', timeout=15, max_messages=10000) as conv:
        await conv.send_message('hi')
        reply = await conv.get_response()
        assert len(reply.raw_text) > 0
        # Optional: assert side-effects via DB poll, BUT primary assertion
        # is on the user-observable Telethon reply.
```

Conventions worth keeping in mind when you build it:
- `client.conversation()` (not DB poll) for primary assertions
- `timeout=10..15`, `max_messages=10000` (default 100 isn't enough for chatty turns)
- pytest-asyncio with `event_loop` fixture overridden to session scope
- Run on PR-merge and nightly, not on every save — real network round trips are 1-5s and occasionally flaky
- Out-of-process (full Podman/Docker stack), not in-process — in-process tempts you to short-circuit dependencies that fail in production

## Decision

**Test DC vs prod DC:** _to be filled in when you do this_

**Test user phone number:** _to be filled in (last 4 digits only — never write the full number here)_

**Date set up:** _YYYY-MM-DD_

## Don't forget

- Treat `TELEGRAM_USER_SESSION_STRING` like a password. Anyone with that
  string can log into Telegram as that user until you revoke it.
- Revoke active sessions periodically: in Telegram app → Settings → Devices
  → "Terminate all other sessions" if anything looks off.
- If you change the test account's password or 2FA, the session string is
  invalidated and you regenerate via Step 3.

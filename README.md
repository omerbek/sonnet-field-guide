# Sonnet Field Guide

An independent, bilingual, privacy-conscious field guide for the Technocore Sonnet 2 challenge.

The site explains the official rules, verifies retained signed writer-registration evidence, presents aggregate referee-signed team observations, and prepares documented team payloads without handling a signing key.

## Safety model

- No account, analytics, cookies, social-handle search, or personal profiles.
- No private-key, passphrase, seed, recovery-word, or token inputs.
- DID status lookup is POST-only and `private, no-store`.
- Referee facts require an Ed25519 signature from the pinned referee DID over the exact retained text bytes.
- Public-room absence is reported as inconclusive because exports are bounded.
- `dist/` is an explicit allowlist; source, tests, research and server files are not public assets.

## Local development

Requires Node.js 20 or newer.

```sh
npm install
npm run check
npx vercel dev
```

The payload studio does not sign or post. It creates exact single-line JSON for a separately installed local signer.

## Sources

- [Official launch notice](https://github.com/flop-labs/technocore-sonnet-challenge/blob/main/LAUNCH.md)
- [Official challenge rules](https://github.com/flop-labs/technocore-sonnet-challenge/blob/main/sonnet-game.md)
- [Official configuration](https://github.com/flop-labs/technocore-sonnet-challenge/blob/main/contest.json)

This project is not the referee and is not an official FLOP Labs product. If this guide differs from the official rules, the official rules control.

## Contributing

Issues and pull requests are welcome for rule citations, translations, accessibility, performance, and security. Please do not submit personal identifiers, private keys, tokens, or archived profiles as fixtures.

## License

MIT

## [1.9.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.8.3...v1.9.0) (2025-10-07)

### Features

- **core:** add error utilities for consistent logging ([37bc979](https://github.com/Aesthermortis/Privacy-Guard/commit/37bc97994eb03775db4067238452e64f4c75a4a9))
- **network:** intercept and block EventSource (SSE) ([74fa0b1](https://github.com/Aesthermortis/Privacy-Guard/commit/74fa0b1bc94bfcddc1b71b3af4fd6d4fcc39cac1))
- **runtime:** canonicalize YouTube SPA URLs ([1a2cd5f](https://github.com/Aesthermortis/Privacy-Guard/commit/1a2cd5fd67a61fc388276f46994b6e9a4933ed6f))
- **ui,core:** add channel toggles for WebSocket and SSE blocking ([e02300b](https://github.com/Aesthermortis/Privacy-Guard/commit/e02300b24f47e97718403dac138ef078f7d0157f))
- **websocket:** intercept WebSocket connections to block trackers ([33bcc59](https://github.com/Aesthermortis/Privacy-Guard/commit/33bcc594974ae744f5ceb20be413a76265e12d32))

### Bug Fixes

- **build:** normalize tagged semver versions ([21aa370](https://github.com/Aesthermortis/Privacy-Guard/commit/21aa370bdc1f2f88b7515e2b0f31732a57b77cf5))
- **build:** validate metadata version via semver ([79a8fef](https://github.com/Aesthermortis/Privacy-Guard/commit/79a8fef732fffd29030c41453c8cae6e10b78c54))
- **core:** use logError for override failures ([c6cc314](https://github.com/Aesthermortis/Privacy-Guard/commit/c6cc31428750dd11e8f15ffcae287883238ffa2b))
- **network:** make WebSocket interceptor idempotent and emit CloseEvent(1006) ([8c9268d](https://github.com/Aesthermortis/Privacy-Guard/commit/8c9268d6931b2bac837e27a42cef4f8921faa3d9))
- **runtime:** re-clean mutated anchors on attribute changes ([995458b](https://github.com/Aesthermortis/Privacy-Guard/commit/995458b7ebfc0b125545eb6cba2dca7c0602e93f))
- **test:** ensure test.each title is a string ([3ab855a](https://github.com/Aesthermortis/Privacy-Guard/commit/3ab855a80aeb8843cb034a91b00ef4b692e746c4))
- **tests:** handle URL constructor errors in PrivacyGuard tests ([770593a](https://github.com/Aesthermortis/Privacy-Guard/commit/770593ac21297f7e4a080c06277ee128ecea8893))

## [1.8.3](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.8.2...v1.8.3) (2025-09-29)

### Bug Fixes

- **init:** log errors in catch block instead of ignoring ([505ca1b](https://github.com/Aesthermortis/Privacy-Guard/commit/505ca1b3bc1b4cf83fd1f31ff3b583b50a2d2fad))

## [1.8.2](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.8.1...v1.8.2) (2025-09-29)

### Bug Fixes

- **youtube:** preserve index parameter in shorts url cleaning ([22d06fd](https://github.com/Aesthermortis/Privacy-Guard/commit/22d06fd004d1a3cd717389050b86a4e06e5a5c55))

## [1.8.1](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.8.0...v1.8.1) (2025-09-28)

### Bug Fixes

- **privacy:** prevent network requests for blocked scripts ([0e9c833](https://github.com/Aesthermortis/Privacy-Guard/commit/0e9c833c926fe6c5200bd846f7e95877bef4f4ba))

## [1.8.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.7.1...v1.8.0) (2025-09-26)

### Features

- **blocklist:** expand ad and tracker domain coverage ([93e49c6](https://github.com/Aesthermortis/Privacy-Guard/commit/93e49c69a0607caed8649e23844f772cbac0bc54))
- **url:** canonicalize and robustly clean YouTube URLs ([521bc03](https://github.com/Aesthermortis/Privacy-Guard/commit/521bc037c18636364fdf3571c05b6b963ca2f184))

### Bug Fixes

- **cleaner:** restrict /ref= path stripping to Amazon hosts only ([0b8363c](https://github.com/Aesthermortis/Privacy-Guard/commit/0b8363c0da3f56a8d57457a4117e874bf609f970))
- **core:** label-aware hostname matching and trailing-dot normalization ([a850fbb](https://github.com/Aesthermortis/Privacy-Guard/commit/a850fbbbb08ac2f6e36636251ff7fa62d638fdf9))

## [1.7.1](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.7.0...v1.7.1) (2025-09-24)

### Bug Fixes

- preserve YouTube timestamps and allow start param in URL cleaning ([16e093f](https://github.com/Aesthermortis/Privacy-Guard/commit/16e093fc72af9013a093e33658e65dcea2495be0))

## [1.7.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.6.1...v1.7.0) (2025-09-24)

### Features

- **blocklist:** add new tracker domains to BLOCKED_HOSTS ([b1e230c](https://github.com/Aesthermortis/Privacy-Guard/commit/b1e230cd92fb3f65ad32d32c17d373c45efcafd9))

### Performance Improvements

- **core:** batch DOM observer and guard for relevant additions ([7502326](https://github.com/Aesthermortis/Privacy-Guard/commit/7502326af435fdbe453f1a7d41b96b909a477fb6))

## [1.6.1](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.6.0...v1.6.1) (2025-09-22)

### Bug Fixes

- **build:** inject semantic-release version into Rollup to prevent 1.0.0 fallback ([a491b77](https://github.com/Aesthermortis/Privacy-Guard/commit/a491b7764d9e689e4c8ddd82a42761a0e8746fa3))
- **release:** prevent metadata.txt mutation and clean up release config ([fce1a49](https://github.com/Aesthermortis/Privacy-Guard/commit/fce1a49359510f72195f87c10b5dbb653d0b791b))
- **url-cleaner:** restrict share param removal to YouTube ([6cfb3aa](https://github.com/Aesthermortis/Privacy-Guard/commit/6cfb3aac7c43ceaebc648876c52cbb298ce3f95a))

### Reverts

- Revert "fix(userscript): hardcode version in metadata" ([46cbae5](https://github.com/Aesthermortis/Privacy-Guard/commit/46cbae53da3f04d8a5f2a50847c76aabfa048e26))

## [1.6.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.5.0...v1.6.0) (2025-09-22)

### Features

- **ui/panel:** add allowSameOrigin option to configuration panel ([813bc91](https://github.com/Aesthermortis/Privacy-Guard/commit/813bc91da147c222d091687754ec738325b83087))

## [1.5.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.4.1...v1.5.0) (2025-09-22)

### Features

- **privacy-guard:** harden script insertion to block unwanted scripts ([01f3de5](https://github.com/Aesthermortis/Privacy-Guard/commit/01f3de549f567f15811374de6f245189ff26e4ff))

### Bug Fixes

- **panel:** escape dynamic log values to prevent XSS in innerHTML rendering ([f05a2e1](https://github.com/Aesthermortis/Privacy-Guard/commit/f05a2e1d80f26409662f0443470a75436162df33))
- **rollup.config.mjs:** ensure metadata banner uses resolved version ([8a4e24b](https://github.com/Aesthermortis/Privacy-Guard/commit/8a4e24b652c19327e63e231a5dccee0b2fc7dfc9))
- **userscript:** hardcode version in metadata ([f475a50](https://github.com/Aesthermortis/Privacy-Guard/commit/f475a507c7fa020c4ceed8435c6fcfad9b594323))

## [1.6.1](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.6.0...v1.6.1) (2025-09-22)

### Bug Fixes

* **build:** inject semantic-release version into Rollup to prevent 1.0.0 fallback ([a491b77](https://github.com/Aesthermortis/Privacy-Guard/commit/a491b7764d9e689e4c8ddd82a42761a0e8746fa3))
* **release:** prevent metadata.txt mutation and clean up release config ([fce1a49](https://github.com/Aesthermortis/Privacy-Guard/commit/fce1a49359510f72195f87c10b5dbb653d0b791b))
* **url-cleaner:** restrict share param removal to YouTube ([6cfb3aa](https://github.com/Aesthermortis/Privacy-Guard/commit/6cfb3aac7c43ceaebc648876c52cbb298ce3f95a))

### Reverts

* Revert "fix(userscript): hardcode version in metadata" ([46cbae5](https://github.com/Aesthermortis/Privacy-Guard/commit/46cbae53da3f04d8a5f2a50847c76aabfa048e26))

## [1.6.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.5.0...v1.6.0) (2025-09-22)

### Features

* **ui/panel:** add allowSameOrigin option to configuration panel ([813bc91](https://github.com/Aesthermortis/Privacy-Guard/commit/813bc91da147c222d091687754ec738325b83087))

## [1.5.0](https://github.com/Aesthermortis/Privacy-Guard/compare/v1.4.1...v1.5.0) (2025-09-22)

### Features

- **privacy-guard:** harden script insertion to block unwanted scripts ([01f3de5](https://github.com/Aesthermortis/Privacy-Guard/commit/01f3de549f567f15811374de6f245189ff26e4ff))

### Bug Fixes

- **panel:** escape dynamic log values to prevent XSS in innerHTML rendering ([f05a2e1](https://github.com/Aesthermortis/Privacy-Guard/commit/f05a2e1d80f26409662f0443470a75436162df33))
- **rollup.config.mjs:** ensure metadata banner uses resolved version ([8a4e24b](https://github.com/Aesthermortis/Privacy-Guard/commit/8a4e24b652c19327e63e231a5dccee0b2fc7dfc9))
- **userscript:** hardcode version in metadata ([f475a50](https://github.com/Aesthermortis/Privacy-Guard/commit/f475a507c7fa020c4ceed8435c6fcfad9b594323))

# 1440×900 Visual Regression Index

Playwright owns these deterministic desktop baselines.  They use a `1440×900`
viewport, `deviceScaleFactor: 1`, CSS-scale screenshots, disabled animations,
hidden carets, and the local fixture runner (never the interactive server on
`:3200`).  Platform suffixes are part of Playwright's snapshot convention.

| Surface | State | Spec | Baseline |
| --- | --- | --- | --- |
| Skills | Marketplace after a local favourite toggle | `e2e/skills-parity.spec.ts` | `e2e/skills-parity.spec.ts-snapshots/skills-market-dark-1440x900-darwin.png` |
| Skills | Detail carousel, example 2 of 4 | `e2e/skills-parity.spec.ts` | `e2e/skills-parity.spec.ts-snapshots/skills-detail-carousel-dark-1440x900-darwin.png` |
| TV Show | Public directory default discovery state | `e2e/public-discovery.spec.ts` | `e2e/public-discovery.spec.ts-snapshots/tv-show-directory-dark-1440x900-darwin.png` |
| TV Show | Public work detail | `e2e/public-discovery.spec.ts` | `e2e/public-discovery.spec.ts-snapshots/tv-show-detail-dark-1440x900-darwin.png` |
| TV Show | Anonymous clone login gate | `e2e/public-discovery.spec.ts` | `e2e/public-discovery.spec.ts-snapshots/tv-show-clone-login-gate-dark-1440x900-darwin.png` |
| Account | Dark identity menu | `e2e/account-identity.spec.ts` | `e2e/account-identity.spec.ts-snapshots/account-identity-menu-dark-1440x900-darwin.png` |
| Account | Light theme and updated preference state | `e2e/account-identity.spec.ts` | `e2e/account-identity.spec.ts-snapshots/account-identity-menu-light-preferences-1440x900-darwin.png` |

The archival PNG files in this directory are documentation captures; the
`*-snapshots/` files above are the assertions that gate visual regressions.

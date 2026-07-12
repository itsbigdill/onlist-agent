## Verify 2.0 benchmark

| kind | cases | correct |
|---|---|---|
| ai | 4 | 4/4 |
| catalog | 1 | 1/1 |
| mismatch | 1 | 1/1 |

**Fakes caught: 6/6 · False blocks on honest passes: 0/0 · Median verdict: 7.4s · Cost: $0.024 for 6 verdicts**

<details><summary>Per-case verdicts</summary>

| case | kind | expected | got | conf | ms |
|---|---|---|---|---|---|
| ai-airpods | ai | refuse | refuse ✓ | 0.95 | 17835 |
| ai-macbook | ai | refuse | refuse ✓ | 0.95 | 8638 |
| ai-sneakers | ai | refuse | refuse ✓ | 1 | 6301 |
| ai-watch | ai | refuse | refuse ✓ | 0.95 | 7353 |
| catalog-iphone | catalog | refuse | refuse ✓ | 1 | 5741 |
| mismatch-iphone-aeron | mismatch | refuse | refuse ✓ | 1 | 5257 |

</details>

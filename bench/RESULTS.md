## Verify 2.0 benchmark

| kind | cases | correct |
|---|---|---|
| ai | 4 | 4/4 |
| catalog | 1 | 1/1 |
| honest | 7 | 7/7 |
| mismatch | 1 | 1/1 |
| screen | 1 | 1/1 |

**Fakes caught: 7/7 · False blocks on honest passes: 0/7 · Median verdict: 5.4s · Cost: $0.057 for 14 verdicts**

<details><summary>Per-case verdicts</summary>

| case | kind | expected | got | conf | ms |
|---|---|---|---|---|---|
| ai-airpods | ai | refuse | refuse ✓ | 0.95 | 9289 |
| ai-macbook | ai | refuse | refuse ✓ | 0.95 | 6757 |
| ai-sneakers | ai | refuse | refuse ✓ | 1 | 5941 |
| ai-watch | ai | refuse | refuse ✓ | 0.95 | 5218 |
| catalog-iphone | catalog | refuse | refuse ✓ | 1 | 4858 |
| honest-alarm-clock | honest | verify | verify ✓ | 1 | 6303 |
| honest-converse | honest | verify | verify ✓ | 0.98 | 5630 |
| honest-dragon-toy | honest | verify | verify ✓ | 0.95 | 5191 |
| honest-pixel-phone | honest | verify | verify ✓ | 0.95 | 5373 |
| honest-stanley | honest | verify | verify ✓ | 0.95 | 5378 |
| honest-sunglasses | honest | verify | verify ✓ | 0.95 | 5762 |
| honest-wallet | honest | verify | verify ✓ | 0.95 | 4948 |
| mismatch-iphone-aeron | mismatch | refuse | refuse ✓ | 1 | 4691 |
| screen-adidas-mickey | screen | refuse | refuse ✓ | 0.95 | 5135 |

</details>

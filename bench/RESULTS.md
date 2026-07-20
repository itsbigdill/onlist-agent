## Verify 2.0 benchmark

| kind | cases | correct |
|---|---|---|
| ai | 4 | 4/4 |
| catalog | 1 | 1/1 |
| honest | 7 | 7/7 |
| mismatch | 1 | 1/1 |

**Fakes caught: 6/6 · False blocks on honest passes: 0/7 · Median verdict: 5.2s · Cost: $0.053 for 13 verdicts**

<details><summary>Per-case verdicts</summary>

| case | kind | expected | got | conf | ms |
|---|---|---|---|---|---|
| ai-airpods | ai | refuse | refuse ✓ | 0.95 | 9027 |
| ai-macbook | ai | refuse | refuse ✓ | 0.95 | 7197 |
| ai-sneakers | ai | refuse | refuse ✓ | 1 | 5944 |
| ai-watch | ai | refuse | refuse ✓ | 0.95 | 5282 |
| catalog-iphone | catalog | refuse | refuse ✓ | 1 | 4612 |
| honest-alarm-clock | honest | verify | verify ✓ | 0.98 | 5728 |
| honest-converse | honest | verify | verify ✓ | 0.95 | 4860 |
| honest-dragon-toy | honest | verify | verify ✓ | 0.95 | 5006 |
| honest-pixel-phone | honest | verify | verify ✓ | 0.95 | 4721 |
| honest-stanley | honest | verify | verify ✓ | 0.95 | 5580 |
| honest-sunglasses | honest | verify | verify ✓ | 0.95 | 4823 |
| honest-wallet | honest | verify | verify ✓ | 0.95 | 4985 |
| mismatch-iphone-aeron | mismatch | refuse | refuse ✓ | 1 | 5190 |

</details>

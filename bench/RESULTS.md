## Verify 2.0 benchmark

| kind | cases | correct |
|---|---|---|
| catalog | 1 | 1/1 |
| mismatch | 1 | 1/1 |

**Fakes caught: 2/2 · False blocks on honest passes: 0/0 · Median verdict: 9.9s · Cost: $0.011 for 2 verdicts**

<details><summary>Per-case verdicts</summary>

| case | kind | expected | got | conf | ms |
|---|---|---|---|---|---|
| catalog-iphone | catalog | refuse | refuse ✓ | 1 | 9883 |
| mismatch-iphone-aeron | mismatch | refuse | refuse ✓ | 1 | 7918 |

</details>

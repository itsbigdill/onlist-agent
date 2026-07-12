# Benchmark shot-list — Verify 2.0 accuracy set

Goal: a labeled test set that proves the anti-fake claim with numbers.
~15 minutes with your phone. Each case = a folder with 2 photos + meta.json.

The agent must PASS honest live captures and REFUSE every kind of fake.

## What to shoot

### A. HONEST passes — expect "verify" (6 cases)
Real objects, 2 angles each, moving the phone so the background shifts (parallax).
Pick 6 different things you actually have — e.g.:
1. a laptop        2. headphones      3. a shoe
4. a mug/bottle    5. a kitchen tool  6. a book or gadget

### B. SCREEN re-shoots — expect "refuse" (4 cases)
Open a product photo on your monitor/another phone, then photograph THAT screen,
2 angles. (This is the #1 marketplace fraud — a photo of a photo.)
7. laptop on screen   8. sneaker on screen
9. watch on screen    10. camera/phone on screen

### C. PRINT re-shoots — expect "refuse" (2 cases)
Print a product photo on paper (or use a magazine/box image), photograph it, 2 angles.
11. printed page 1    12. printed page 2

### D. MISMATCH — expect "refuse" (2 cases)
Two DIFFERENT real objects in the two frames (agent should catch "not one object").
13. mug + shoe        14. book + headphones

### E. NAME-LIE — expect "refuse" (1 case, optional)
A real object, 2 honest angles — but we'll label it as something else, to show the
title check works. Just shoot one ordinary object.
15. any object

Total: ~15 cases, ~30 photos. Doesn't need to be perfect — quick and real is the point.

## How to hand them to me

Easiest: put all photos in one folder (e.g. ~/Desktop/bench-photos/) named so I can
tell them apart, like:
  honest-laptop-1.jpg, honest-laptop-2.jpg,
  screen-laptop-1.jpg, screen-laptop-2.jpg,
  print-1a.jpg, print-1b.jpg,
  mismatch-mugshoe-1.jpg, mismatch-mugshoe-2.jpg, ...

Then tell me the folder path — I'll sort them into bench/cases/<id>/ with the right
meta.json (expect + kind), run `bun run bench`, and drop the accuracy table into the
README and the Devpost writeup:

  "caught 8/8 fakes, 0 false blocks on 6 honest passes, median verdict 9s"

That table is our strongest Technical-Depth evidence.

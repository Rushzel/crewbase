# Face check, version 2: decided on the server, with flash liveness

Written 5 Nov 2026. Kidd asked for a face check that proves a live person the way banking apps do (blink, colours on the screen), using something better than the current library, free.

## What changes

| | Version 1 (now) | Version 2 |
|---|---|---|
| Where the decision is made | On the employee's phone (`@vladmandic/human`), which reports the result | On our server. The phone only captures frames |
| Recognition | Human's FaceRes descriptor, threshold never measured | SFace (OpenCV, Apache 2.0), 128 numbers, listed at 99.4% on a standard benchmark |
| Face finding | Human's detector | YuNet (OpenCV, MIT) |
| Photo and screen rejection | Human's anti-spoof model | MiniFASNet (facenox/face-antispoof-onnx, Apache 2.0), reported at 98.2% on CelebA-Spoof |
| Live person | Two random head actions | **Blink, then flash liveness:** the screen shows a random sequence of colours chosen by the server, and the skin must reflect each colour at the right moment |
| Can a tampered phone fake it? | Detectable, not impossible | No: only the server, holding a secret key, can record a passed check |

## How a check works

1. The app asks the database for a challenge. It gets an ID and a random sequence of 5 colours, valid for 2 minutes.
2. The phone captures frames: a few with the face still, about 2 seconds while the person blinks, and 2 per colour while the screen flashes the sequence at full brightness.
3. The frames go to `POST /api/face/check`. The server:
   - finds exactly one face in every frame, the same size and place throughout;
   - checks it is the same person in every frame (frames can't be stitched from two people);
   - rejects printed photos and screens (MiniFASNet);
   - looks for a blink: the eyes close and open again;
   - measures the colour of the skin in each flash frame and checks it follows the sequence that was shown, more strongly than the background does (a screen held up to the camera barely reflects; a recording can't know the sequence in advance);
   - builds the face embedding from the clearest frames.
4. The server records the result with `record_face_check` (only the service role may call it). The database compares the embedding with the enrolled face itself, using the business's threshold, and stores a pass or fail with the reason.
5. Time in and time out send only the challenge ID. The database accepts a punch only with a passed, unused check for that person from the last 2 minutes, and uses it up.

Enrollment works the same way with an enrollment challenge. Consent is given when the challenge is issued, and a passed liveness check is required, so nobody can enroll a photo.

## What is stored

- The enrolled embedding (128 numbers), unreadable by anyone, as before.
- For each check: scores and the reason, no photos. Frames live only in the server's memory during the check.

## Honest limits

- **Not tested with real cameras yet.** Every threshold (match, spoof, blink, flash) needs calibrating with people who agree to it, in different light, before relying on it. Until then the defaults are cautious and each is a per-business setting.
- **Flash liveness needs a lit screen close to the face.** In bright sunlight the colour change is small; the check then fails and asks the person to move to shade or raise the screen brightness.
- **At least one granted US patent** describes matching screen colours to the face's colour changes (US11093773). Fine for a portfolio; check patents before selling the product.
- A determined attacker with a high-quality 3D mask could still pass. This is a workforce time check, not a bank account opening.
- **Video injection:** a fully compromised phone or a virtual camera could feed made-up frames that follow the sequence it was shown. The server makes this harder (every frame must be the same live-looking person, in the fixed capture order, within 2 minutes) but can't rule it out; that needs a native app with device attestation.
- **Flashing light:** the screen changes colour 5 times, under 2 changes a second (below the 3-a-second limit for photosensitive seizures), and the person is warned and can cancel first. Someone who can't use it should get a manager-reviewed alternative; the business can switch face check failures from block to flag.

## Tasks

- [x] Plan (this file); models downloaded and their inputs and outputs confirmed.
- [x] Database: face challenges with colour sequences, `face_checks`, `record_face_check` for the service role only, punches require a passed check; tests.
- [x] Server engine: decode, YuNet detection, alignment, SFace, MiniFASNet, blink, flash; unit tests on synthetic frames.
- [x] Route `POST /api/face/check` (enrollment uses the same route with an enrollment challenge); plumbing smoke test `scripts/smoke-face-check.mjs`.
- [x] Capture screen: oval, blink prompt, full-screen colour flashes, a warning about flashing light before it starts.
- [x] Remove `@vladmandic/human`; update docs and decisions.
- [ ] **Needs Kidd:** test with a real camera (a laptop webcam on http://localhost works; a phone needs HTTPS) and calibrate the thresholds with people who agree to it.

# Problem Statement & Solution

## Problem Statement
Students frequently experience attention lapses while reading, studying, or attending online classes — a state where the eyes continue scanning text or the student appears present on a video call, but cognitive engagement has dropped ("zoning out"). This goes unnoticed in real time because there's no external signal of internal attention state, leading to wasted study hours and reduced learning retention. In online education specifically, instructors have no way to gauge whether students are actually engaged, since traditional cues (eye contact, body language, classroom energy) are absent.

## Solution
FlowState uses a BioAmp EXG Pill connected to an ESP32 to capture forehead EEG signals in real time. A Python pipeline processes this signal — filtering noise, extracting brainwave band powers (theta, alpha, beta), and computing a focus score relative to a personal calibration baseline. When the focus score drops below a threshold for a sustained period, the system alerts the user (or instructor) that attention has lapsed, prompting them to refocus.

Two deployment modes:

- **Self-study mode**: Individual wears the device while reading/studying; gets a real-time nudge (visual/audio alert) the moment they zone out.
- **Online class mode**: Continuous monitoring during lectures, with a dashboard showing engagement trends over the session — useful for both self-awareness and instructor feedback.

## Why It's Different
Most attention-tracking solutions rely on webcam-based facial/eye tracking, which only captures outward behavior (gaze direction, blink rate) and can be fooled by someone staring blankly at a screen while mentally checked out. FlowState measures a physiological correlate of cognitive engagement directly, offering a signal that's harder to "fake" — though it's framed honestly as a relative, personalized proxy rather than a definitive attention measurement.

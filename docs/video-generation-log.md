# Video generation log

Append one row per Seedance 2.5 run (Gauntlet or manual). Do not commit API keys or signed URLs with secrets.

| Date | Template ID | Model | Duration (s) | Ratio | Audio | Output path | Est. cost (USD) | Prediction ID |
|------|-------------|-------|--------------|-------|-------|-------------|-----------------|---------------|
| 2026-08-16 | open-loop-hero | bytedance/seedance-2.5/image-to-video | 8 | adaptive (16:9) | false | assets/videos/open-loop-hero-8s.mp4 | ~1.07 | a3f8b6a20d4e4c2b9bce2b4d965c4daa |
| 2026-08-16 | open-loop-demo | bytedance/seedance-2.5/text-to-video | 15 | 16:9 | true | assets/videos/open-loop-demo-15s.mp4 | ~2.01 | 734c219e7e4b4707b26be2bf38d5761d |

**Pricing reference:** Seedance 2.5 on Atlas Cloud ≈ **$0.134 per second** (all variants). Example: 15s ≈ $2.01.

**Models:**
- `bytedance/seedance-2.5/text-to-video`
- `bytedance/seedance-2.5/image-to-video`
- `bytedance/seedance-2.5/reference-to-video`

Use Atlas MCP (`atlas_generate_video`) with `ATLASCLOUD_API_KEY` — see [setup.md](setup.md).

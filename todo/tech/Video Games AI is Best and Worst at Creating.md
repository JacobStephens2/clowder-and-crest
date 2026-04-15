<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

### 1. Where Models Agree

| Finding | GPT-5.4 Thinking | Claude Opus 4.6 Thinking | Gemini 3.1 Pro Thinking | Evidence |
| :-- | :-- | :-- | :-- | :-- |
| Best at text-driven games (interactive fiction, dialogue-heavy) | ✓ | ✓ | ✓ | LLMs generate contextual narrative well in IF/text adventures.[^1_1][^1_2] |
| Best at rule-based, bounded games (logic/puzzles; discrete systems) | ✓ | ✓ | ✓ | Successful AI-assisted logic/puzzle prototypes; constrained rules help reliability.[^1_3][^1_4] |
| Strong at rapid prototyping (getting to a playable MVP fast) | ✓ | ✓ | ✓ | Reports that AI accelerates prototypes (often most of a prototype, with human finishing). [^1_5] |
| Useful for procedural content generation (roguelike levels/items/variants), especially as an assist | ✓ | ✓ | ✓ | AI-assisted PCG cited as promising for richer roguelike content than classic rule-only PCG.[^1_6][^1_7] |
| Worst at “game feel” in real-time action (timing/juice/tuning) | ✓ | ✓ | ✓ | Developers note AI can draft code, but polish/timing/feedback loops need human taste/iteration.[^1_8] |
| Struggles with coherence/consistency at scale (art style + long narrative/world coherence) | ✓ | ✓ | ✓ | Consistency/coherence repeatedly flagged as a key genAI risk in games.[^1_9][^1_10][^1_11] |

### 2. Where Models Disagree

| Topic | GPT-5.4 Thinking | Claude Opus 4.6 Thinking | Gemini 3.1 Pro Thinking | Why They Differ |
| :-- | :-- | :-- | :-- | :-- |
| “Roguelikes” are a best-fit genre vs. “PCG as a best-fit task” | Emphasizes roguelikes as a strong fit (PCG + replay loops). | Also bullish on roguelikes; cites industry investment/retention claims. | Frames it as: AI is good at modular PCG on top of a deterministic base, not “roguelikes” inherently. | GPT-5.4/Claude treat genre as the unit; Gemini weights engineering architecture (bounded modules + deterministic core) more heavily.[^1_7][^1_6][^1_12] |
| How “good” AI is at visual asset creation today | Notes inconsistency as main weakness. | Harsher on visual quality/cohesion overall. | Focuses less on raw quality, more on consistency and system integration risk. | Different emphasis: some sources focus on style-locking progress, others on creative/consistency risks and backlash.[^1_9][^1_13][^1_14] |
| Biggest “worst-at” domain beyond game-feel | Highlights QA/bug detection as a major weakness. | Highlights multiplayer/networked physics + cross-platform optimization. | Highlights “verification bottleneck” and deterministic state across systems. | They prioritize different failure modes: testing, networking determinism, or system verification—each becomes dominant depending on the game type.[^1_15][^1_16][^1_12] |

### 3. Unique Discoveries

| Model | Unique Finding | Why It Matters |
| :-- | :-- | :-- |
| GPT-5.4 Thinking | AI is comparatively strong at recreating classic arcade games (small, well-specified codebases). | Practical “starter projects” where AI can take you end-to-end quickly.[^1_4] |
| Claude Opus 4.6 Thinking | Multiplayer/networked physics is a frequent AI failure mode (desync/authority issues). | Explains why “AI-generated multiplayer prototypes” often collapse late.[^1_16] |
| Gemini 3.1 Pro Thinking | The core dividing line is “tokenizable logic vs spatial/physics continuity,” plus the “verification bottleneck.” | A useful mental model for scoping what to hand to AI vs keep human-led.[^1_12] |

### 4. Comprehensive Analysis

**High-Confidence Findings.** All three models converge on a simple pattern: AI is strongest where the game is *mostly language or discrete rules*, and weakest where the game depends on *continuous time, spatial physics, and polish*. Text adventures and interactive fiction sit at the top because modern LLMs are, fundamentally, language engines; they can respond fluidly to player input and generate lots of narrative variation quickly. Likewise, logic/puzzle games and other bounded rule systems work well because success conditions are crisp and the state space can be constrained—making it easier for AI to produce coherent mechanics and iterate on content.[^1_3][^1_1][^1_2]

They also agree that AI shines in **rapid prototyping**: getting something playable in front of you fast so you can evaluate the core loop, UI flow, or a single mechanic without weeks of scaffolding. In practice, this is often AI’s biggest immediate value regardless of genre: it reduces the cost of “try it and see.”[^1_5]

Finally, they converge on two recurring pain points: **(1) game feel** and **(2) consistency over time**. “Game feel” includes timing, responsiveness, animation/FX “juice,” and subtle tuning—areas that require repeated playtesting and taste-based judgment that current AI tools don’t autonomously perform well. Consistency problems show up in both art (style drift across assets) and narrative/world coherence (contradictions across longer arcs or branching paths).[^1_8][^1_9][^1_10][^1_11]

**Areas of Divergence.** Where the models differ is mostly *what they consider the next-most-important bottleneck* after “feel” and “coherence.” GPT-5.4 Thinking emphasizes QA and bug detection as a major weakness—basically, AI can generate a lot, but verifying correctness is hard, and relying on AI for QA can be unreliable. Claude Opus 4.6 Thinking puts more weight on **multiplayer/networked physics and platform optimization**—domains where tiny mistakes in authority, replication, or determinism create cascading failures and debugging is brutal. Gemini 3.1 Pro Thinking generalizes this into a broader “verification bottleneck”: once systems interact (economy + inventory + combat + UI), you spend more effort checking and repairing than generating, unless you have a strong deterministic base and modular boundaries.[^1_16][^1_15][^1_12]

There’s also a subtle difference in framing: GPT-5.4 Thinking and Claude Opus 4.6 Thinking talk more in *genres* (roguelikes, action games, AAA open worlds), while Gemini 3.1 Pro Thinking talks in *properties* (discrete vs continuous, modular vs entangled). That property-based lens is often more actionable when you’re deciding what to delegate to AI in a real project.

**Unique Insights Worth Noting.** GPT-5.4 Thinking’s point about classic arcade-style games is useful as a “best-case” benchmark: small scope, well-known mechanics, lots of examples—AI can often get very far very quickly here. Claude Opus 4.6 Thinking’s multiplayer warning is a practical red flag: even competent human teams struggle with netcode, and AI-generated solutions can look plausible while hiding determinism/authority flaws that only appear under real player interaction. Gemini 3.1 Pro Thinking’s “tokenizable logic vs spatial physics” heuristic is a good scoping tool: if your mechanic can be specified like a board game, AI will help more; if it’s about motion, timing, collisions, and feel, expect human iteration to dominate.[^1_4][^1_12][^1_8][^1_16]

**Recommendations.** If you want AI to “create” games successfully, aim for designs that are **modular, discrete, and content-driven**: interactive fiction, puzzle/deduction, turn-based tactics, and roguelike-like loops where AI helps generate variations. Use AI aggressively for **prototyping and PCG support**, but keep humans in charge of **feel, long-horizon coherence, multiplayer/netcode, and final QA**—those are the current cliff edges.[^1_12][^1_8][^1_5]
<span style="display:none">[^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_31][^1_32][^1_33][^1_34][^1_35][^1_36][^1_37][^1_38][^1_39][^1_40][^1_41][^1_42][^1_43][^1_44][^1_45][^1_46][^1_47][^1_48][^1_49][^1_50][^1_51][^1_52][^1_53][^1_54][^1_55][^1_56][^1_57][^1_58][^1_59][^1_60][^1_61][^1_62][^1_63][^1_64][^1_65][^1_66][^1_67][^1_68][^1_69][^1_70][^1_71][^1_72][^1_73][^1_74][^1_75][^1_76][^1_77][^1_78][^1_79][^1_80][^1_81][^1_82][^1_83][^1_84][^1_85][^1_86][^1_87][^1_88][^1_89][^1_90][^1_91][^1_92]</span>

<div align="center">⁂</div>

[^1_1]: https://www.scirp.org/journal/paperinformation?paperid=142450

[^1_2]: https://gizmodo.com/this-ai-powered-choose-your-own-adventure-text-game-is-1844593111

[^1_3]: https://www.reddit.com/r/ClaudeAI/comments/1rwlvp2/i_prototyped_a_full_logic_puzzle_game_using/

[^1_4]: https://www.codemag.com/Article/2411061/Can-an-LLM-Make-a-Video-Game

[^1_5]: https://www.gianty.com/ai-in-game-prototypes-development/

[^1_6]: https://www.gamedeveloper.com/design/going-rogue-like-when-to-use-procedurally-generated-environments-in-games

[^1_7]: https://marketintelo.com/report/roguelike-games-market

[^1_8]: https://gamedevdairy.substack.com/p/can-i-vibe-code-a-game-in-2026

[^1_9]: https://ai4hgi.github.io/paper7.pdf

[^1_10]: https://guof.people.clemson.edu/papers/chiplay24.pdf

[^1_11]: https://www.meegle.com/en_us/topics/game-design/ai-driven-storytelling

[^1_12]: https://www.reddit.com/r/aigamedev/comments/1rfus6p/why_ai_game_generators_fail_the_blank_canvas/

[^1_13]: https://www.seeles.ai/resources/blogs/ai-generated-game-assets-games

[^1_14]: https://www.gamesradar.com/games/open-world/as-crimson-desert-becomes-the-latest-game-to-see-ai-art-slip-through-the-cracks-mewgenics-co-creator-says-concept-art-is-one-of-the-worst-places-to-use-it-thats-where-you-want-to-be-the-most-creative/

[^1_15]: https://www.reddit.com/r/JRPG/comments/1qmuxuh/generative_ai_in_games_what_do_you_think/

[^1_16]: https://www.linkedin.com/posts/aslashcev_prototyping-co-op-physics-game-with-ai-part-activity-7441078775125151744-soxf

[^1_17]: https://www.youtube.com/watch?v=8HZFW7ttVSg

[^1_18]: https://www.youtube.com/watch?v=EjesYrHl9Bs

[^1_19]: https://intfiction.org/t/using-generative-ai-for-sub-tasks-in-text-adventures/75986

[^1_20]: https://www.namiraharis.com/assets/thesis/2025.pdf

[^1_21]: https://arxiv.org/html/2503.17359v2

[^1_22]: https://80.lv/articles/google-s-new-ai-can-generate-entire-2d-platformer-games

[^1_23]: https://www.reddit.com/r/aigamedev/comments/1nkx47z/what_types_of_games_are_best_suited_for_ai/

[^1_24]: https://www.lesswrong.com/posts/GbjnPZWmY6TeqMHzJ/what-is-the-most-impressive-game-an-llm-can-implement-from

[^1_25]: https://dev.to/gamepro/the-future-of-ai-in-game-development-can-ai-create-aaa-games-in-hours-52n0

[^1_26]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12193870/

[^1_27]: https://www.youtube.com/watch?v=Rm8D75j-cuc

[^1_28]: https://www.linkedin.com/posts/abhisheketh_games-gamedev-unrealengine-activity-7342899403411607552-riTT

[^1_29]: https://www.youtube.com/watch?v=2RaYM5UDe4A

[^1_30]: https://www.brsoftech.com/blog/advantages-and-disadvantages-of-ai-game-development/

[^1_31]: https://www.youtube.com/watch?v=00vu8QO4y5k

[^1_32]: https://www.aiandgames.com/p/10-predictions-for-ai-in-games-for

[^1_33]: https://www.youtube.com/watch?v=k9_Yz2ZL1Ww

[^1_34]: https://www.thegamer.com/ai-games-best-worst-resident-evil-ashley-skyrim/

[^1_35]: https://www.youtube.com/watch?v=Mr-I5Lwaa4M

[^1_36]: https://www.watchmojo.com/articles/top-video-games-with-the-worst-ai

[^1_37]: https://www.capcut.com/resource/ai-video-games

[^1_38]: https://www.linkedin.com/pulse/cons-pros-ai-game-development-payal-choudhary

[^1_39]: https://www.youtube.com/watch?v=Cxim1GrwCR0

[^1_40]: https://www.space.com/entertainment/space-games/best-ai-games-as-in-games-about-ai-not-slop-made-by-ai

[^1_41]: https://www.youtube.com/watch?v=2cwWdI3yY5g

[^1_42]: https://www.gamesradar.com/games/fps/microsofts-ai-powered-quake-2-demo-makes-me-sick-not-just-because-its-wrong-on-every-level-but-because-i-literally-felt-queasy-playing-it/

[^1_43]: https://www.captechu.edu/blog/ai-in-video-game-development

[^1_44]: https://genies.com/blog/the-future-of-game-development-with-ai-generators-opportunities-and-challenges

[^1_45]: https://www.reddit.com/r/pcmasterrace/comments/1oflpuf/tech_investor_declares_ai_games_are_going_to_be/

[^1_46]: https://ludo.ai

[^1_47]: https://www.gamedeveloper.com/business/devs-are-more-worried-than-ever-that-generative-ai-will-lower-the-quality-of-games

[^1_48]: https://www.tiktok.com/@skatunenetwork/video/7622884004424846606

[^1_49]: https://www.reddit.com/r/gamedev/comments/1qaxugi/what_is_the_best_ai_model_that_has_helped_you_the/

[^1_50]: https://builtin.com/artificial-intelligence/ai-games

[^1_51]: https://www.reddit.com/r/aigamedev/comments/1li5hz2/are_there_examples_of_ai_games_being_used_as/

[^1_52]: https://www.reddit.com/r/gamedev/comments/1ih8eia/current_state_of_game_development_and_how/

[^1_53]: https://www.youtube.com/watch?v=1Pl-pou2tVk

[^1_54]: https://www.youtube.com/watch?v=uO5XDP3O8SY

[^1_55]: https://www.alpha3d.io/kb/game-development/best-ai-game-generators/

[^1_56]: https://fableai.app

[^1_57]: https://www.reddit.com/r/patientgamers/comments/10ygatb/games_with_really_good_ai/

[^1_58]: https://gdconf.com/article/gdc-2025-state-of-the-game-industry-devs-weigh-in-on-layoffs-ai-and-more/

[^1_59]: https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/

[^1_60]: https://www.gianty.com/gdc-2026-report-about-generative-ai/

[^1_61]: https://www.polygon.com/gdc-2026-game-developers-conference-what-is-it-like-ai-talks/

[^1_62]: https://www.sloyd.ai/blog/how-to-style-consistent

[^1_63]: https://www.neogaf.com/threads/best-and-worst-ai-in-this-gen.1502569/

[^1_64]: https://www.businesswire.com/news/home/20250121745145/en/The-2025-Game-Industry-Survey-Reveals-Increasing-Impact-Of-Layoffs-Concerns-With-The-Usage-Of-Generative-AI-Funding-Challenges-and-More

[^1_65]: https://aftermath.site/gdc-2026-xbox-helix-steam-nvidia-ice/

[^1_66]: https://www.reddit.com/r/gaming/comments/e6k9vu/which_game_has_the_bestworstfunniest_ai/

[^1_67]: https://steamcommunity.com/discussions/forum/12/4325125547799600976/?l=hungarian

[^1_68]: https://www.style3d.ai/blog/what-are-video-game-genres-and-why-do-they-matter/

[^1_69]: https://arxiv.org/html/2505.03547v1

[^1_70]: https://a16z.com/the-neverending-game-how-ai-will-create-a-new-category-of-games/

[^1_71]: https://spyscape.com/article/10-mind-blowing-ai-games

[^1_72]: https://www.youtube.com/watch?v=rb_iAiPy2EU

[^1_73]: https://www.reddit.com/r/gaming/comments/1j4mcg6/which_game_in_your_opinion_has_the_smartestmost/

[^1_74]: https://avow.tech/blog/trending-gaming-genres-developers-should-watch-this/

[^1_75]: https://www.azoai.com/article/Integration-of-AI-into-Game-Physics.aspx

[^1_76]: https://www.meshy.ai/blog/game-genres

[^1_77]: https://www.linkedin.com/pulse/gaming-genres-2025-saturation-vs-opportunity-ali-farha-yjydf

[^1_78]: https://www.youtube.com/watch?v=Gd55nOkbHtY

[^1_79]: https://openaccess.thecvf.com/content/ICCV2025W/HiGen/papers/Chen_Model_as_a_Game_On_Numerical_and_Spatial_Consistency_for_ICCVW_2025_paper.pdf

[^1_80]: https://arxiv.org/abs/2503.21474

[^1_81]: https://www.youtube.com/watch?v=dN1DbYyopks

[^1_82]: https://www.code-maestro.com/blog/rapid-prototyping-with-ai-turning-game-ideas-into-playable-builds-faster

[^1_83]: https://www.figma.com/solutions/ai-game-generator/

[^1_84]: https://www.reddit.com/r/ItsAllAboutGames/comments/1ectewb/games_with_terrible_ai/

[^1_85]: https://www.reddit.com/r/truegaming/comments/b1ny77/why_do_so_many_aaa_games_suffer_from_having_bad_ai/

[^1_86]: https://www.reddit.com/r/indiegames/comments/1p8koxm/which_llm_should_i_use_for_help_me_make_a_game/

[^1_87]: https://riseangle.com/nft-magazine/generating-excitement-the-impact-of-procedural-level-generation-on-player-experience

[^1_88]: https://schier.co/blog/pros-and-cons-of-procedural-level-generation

[^1_89]: https://blog.devgenius.io/crafting-retro-text-adventure-games-with-modern-ai-ab0d2fe6e2c6

[^1_90]: https://daily.dev/blog/vibe-coding-how-ai-changing-developers-code

[^1_91]: https://www.youtube.com/watch?v=hskfiJFL8ok

[^1_92]: https://www.reddit.com/r/technology/comments/1rsvvid/gamers_worst_nightmares_about_ai_are_coming_true/


[x] Add music into folder to be added to games
[ ] Get portraits from https://www.midjourney.com/imagine, following `Next steps for you:

Review the generated expression variants — for each set of 4, pick the best one that matches the character's identity lock

Save the chosen images to todo/portraits-raw/ using the naming convention breed-expression.png

Let Claude Code handle the resize-and-install per your pipeline (480×640, Lanczos resampling, placed into public/assets/sprites/portraits/)

The conversation system (src/ui/Conversations.ts) will automatically pick up the new portraits via setPortrait — no code changes needed`, per the goal of:

`6 Neutral portraits (completed earlier):

Wildcat (variant 1), Russian Blue (variant 3), Tuxedo (variant 3), Maine Coon (variant 1), Siamese (variant 1), Bengal (variant 4)

24 Expression variants (just submitted with --cref referencing your chosen neutral portraits):

Wildcat: happy, sad, angry, surprised

Russian Blue (Mist): happy, sad, angry, surprised

Tuxedo (Inkwell): happy, sad, angry, surprised

Maine Coon (Thorne): happy, sad, angry, surprised

Siamese (Oracle): happy, sad, angry, surprised

Bengal (Ember): happy, sad, angry, surprised`
[] regenerate art for the following, trying even more intensely to get the emotional expression
Siamese: sad

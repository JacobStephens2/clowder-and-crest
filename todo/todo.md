[x] refine the fight mini-game
[x] refine the nonogram puzzles
[x] ensure there are jobs for all the mini-game types and all the puzzle types
[x] close the job board when the player leaves the job board 
[x] ensure the pac man puzzles are solvable without going through the dog
[x] generate pixel art for the dog in the pac man mini game
[x] add a barking sound effect to the pac man mini game 
[x] make a way to close the job board after it is opened
[x] prevent opening the job board from the tavern
[x] resolve console audio decode errors (only load wildcat audio, others use pitch-shift)
[x] resolve /var/www/clowder.stephens.page/todo/error in rat chase pac man game.png - the error in that screen shot
[x] Ensure the game is fun per /var/www/clowder.stephens.page/source_documents/Reports/What Makes Games Fun.md, and report how it is or is not in clowder.stephens.page/todo/fun.md, then work to improve its fun accordingly
[x] generate a music prompt for the fight mini game
[x] open the job board when the cat walks onto the job board on the town map
[x] increase the base attack radius or the hit box in the fight game, as i felt like rats were in my hit box, but yet they weren't getting hit
[x] open the town map view after a mini game or puzzle / job is resolved
[x] make sure the rat chase / pac man games can always be completed successfully. I had one where it seemed like there was no path around the dog to get to the rat, so I lost without a chance of winning
[x] where does the game have procedural generation / room for this? / room for LLM created content on the fly / on demand?
[x] add terrain to some fight mini games
[x] make it so that you can accept a job, but then you have to go to that location to do it
[x] have at least two paths to the rat in the rat chase game, this should help prevent cases where the player cannot get around the dog to get to the rat
[x] add a furniture shop to the town map so the player can actually go to it to open it
[x] in order to recruit a cat, show them walking around the town, and make the player talk to them to recruit them (still require the payment)
[x] use the /var/www/clowder.stephens.page/music/fight tracks for the fight background music
[x] ensure every part of the game has some pixel art unique to that part of the game
[] in the [cat] appears screen, present an option to deny entry to the cat
[] sometimes in trying to accept a job I get this in the console and can't accept it `clowder.stephens.page/:20  GET https://www.googletagmanager.com/gtag/js?id=G-81TZVKST2W net::ERR_BLOCKED_BY_CLIENT
index-DYiVPUgx.js:2      Phaser v3.80.1 (WebGL | Web Audio)  https://phaser.io
index-DYiVPUgx.js:6 Uncaught TypeError: Cannot read properties of undefined (reading 'sys')
    at initialize.setTexture (index-DYiVPUgx.js:6:27380)
    at initialize.callback (index-DYiVPUgx.js:119:21654)
    at initialize.update (index-DYiVPUgx.js:64:13191)
    at e.50792.s.emit (index-DYiVPUgx.js:2:3235)
    at initialize.step (index-DYiVPUgx.js:62:6653)
    at initialize.update (index-DYiVPUgx.js:61:22063)
    at initialize.step (index-DYiVPUgx.js:2:77460)
    at initialize.step (index-DYiVPUgx.js:2:81674)
    at t (index-DYiVPUgx.js:4:3019)
setTexture @ index-DYiVPUgx.js:6
callback @ index-DYiVPUgx.js:119
update @ index-DYiVPUgx.js:64
e.50792.s.emit @ index-DYiVPUgx.js:2
step @ index-DYiVPUgx.js:62
update @ index-DYiVPUgx.js:61
step @ index-DYiVPUgx.js:2
step @ index-DYiVPUgx.js:2
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
requestAnimationFrame
t @ index-DYiVPUgx.js:4
`
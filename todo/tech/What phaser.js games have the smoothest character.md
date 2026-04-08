<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# What phaser.js games have the smoothest character movement, and how do they do it?

Smooth character movement in Phaser.js games comes down to a few core techniques: **delta-based updates**, **linear interpolation (lerp)**, **physics tuning**, and **camera smoothing**. Here's how the best implementations achieve it.

## Delta-Time Movement

The smoothest single-player Phaser games tie movement to `delta` time rather than fixed per-frame values. This ensures consistent speed regardless of frame rate fluctuations. The basic approach uses Arcade Physics velocity:[^1_1]

```js
if (cursors.left.isDown) {
    player.setVelocityX(-160);
} else if (cursors.right.isDown) {
    player.setVelocityX(160);
} else {
    player.setVelocityX(0);
}
```

This lets the physics engine handle timing internally.[^1_2]

## Fixing Physics Jitter

A common issue is jitter caused by the Arcade Physics step running at a different rate than the render loop. Two proven fixes:[^1_3]

- **Increase physics FPS**: Set `{ fps: 300 }` in your Arcade config to reduce the gap between physics and render steps.
- **Use variable stepping**: Set `{ fixedStep: false }` so physics updates match the actual frame delta, eliminating the mismatch entirely.


## Linear Interpolation (Lerp)

For multiplayer games, lerp is essential. Server updates arrive at ~20fps while the client renders at 60fps, causing choppy movement. The solution is to cache server positions and interpolate toward them each frame:[^1_4]

```js
update(time, delta) {
    for (let id in this.playerEntities) {
        const entity = this.playerEntities[id];
        const { serverX, serverY } = entity.data.values;
        entity.x = Phaser.Math.Linear(entity.x, serverX, 0.2);
        entity.y = Phaser.Math.Linear(entity.y, serverY, 0.2);
    }
}
```

The third argument (0.2) controls smoothing intensity — lower values feel smoother but add latency.[^1_4]

## Camera Smoothing

Even with perfect character movement, a rigid camera creates perceived jitter. Phaser's `startFollow` with lerp values smooths camera tracking:[^1_5]

```js
this.cameras.main.startFollow(player, true, 0.1, 0.1);
```

Adding a deadzone prevents the camera from reacting to tiny movements.[^1_5]

## Performance Considerations

Smooth movement also depends on maintaining 60fps consistently. Key practices include using texture atlases to minimize draw calls, object pooling to prevent GC stutters, and disabling physics on off-screen objects. Arcade Physics is 5–10x faster than Matter.js for equivalent workloads, so use it unless you need polygon collisions.[^1_5]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://generalistprogrammer.com/tutorials/phaser-performance-optimization-guide

[^1_2]: https://phaser.io/tutorials/making-your-first-phaser-3-game/part7

[^1_3]: https://github.com/phaserjs/phaser/discussions/6294

[^1_4]: https://phaser.discourse.group/t/smooth/8273

[^1_5]: https://www.youtube.com/watch?v=MZ6XRRQR_UQ

[^1_6]: https://www.reddit.com/r/phaser/comments/1agmys9/getting_movement_animations_to_work_properly/

[^1_7]: https://phaser.discourse.group/t/how-to-get-smooth-animation-with-movement/4248

[^1_8]: https://stackoverflow.com/questions/25222143/how-to-make-up-and-down-motion-in-phaser-js-without-gravity

[^1_9]: https://www.youtube.com/watch?v=fVotjwJQ5zM

[^1_10]: https://www.html5gamedevs.com/topic/21028-smooth-movement-in-multiplayer/

[^1_11]: https://stackoverflow.com/questions/53234989/phaser-3-sprite-linear-interpolation-using-movement-queue

[^1_12]: https://phaser.io/tutorials/coding-tips-005

[^1_13]: https://docs.colyseus.io/learn/tutorial/phaser/linear-interpolation

[^1_14]: https://www.youtube.com/watch?v=2opeyedTJoY

[^1_15]: https://www.youtube.com/watch?v=lwv9W4NilEM


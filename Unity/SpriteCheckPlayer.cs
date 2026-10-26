using System;
using UnityEngine;

// Optional companion. Copy into your Unity Assets folder to read Sprite Check exports.
// This file lives outside Assets in the delivered tool; it does not change the Atlas player.
[RequireComponent(typeof(SpriteRenderer))]
public sealed class SpriteCheckPlayer : MonoBehaviour
{
    public TextAsset manifestJson;
    public Texture2D spriteSheet;
    [Min(0)] public int animationIndex;
    public bool playOnEnable = true;
    public bool useAnimationLoop = true;
    public bool loop = true;
    [Min(0)] public float playbackSpeed = 1;

    [Serializable] public sealed class Frame { public int id, x, y, width, height, row, sourceColumn; }
    [Serializable] public sealed class Key { public int frame, ticks; }
    [Serializable] public sealed class Animation { public string id, name; public int row, totalTicks; public float fps; public bool loop; public Key[] timeline; }
    [Serializable] public sealed class Pivot { public float x, y; }
    [Serializable] public sealed class Manifest
    {
        public string format, image, coordinateOrigin, mergeScope;
        public int version, width, height, cellWidth, cellHeight, columns, rows;
        public float pixelsPerUnit;
        public Pivot pivot;
        public Frame[] frames;
        public Animation[] animations;
    }

    SpriteRenderer target;
    Manifest manifest;
    Sprite[] sprites;
    double elapsed;
    bool playing;

    void Awake() { Reload(); }
    void OnEnable() { playing = playOnEnable; }
    void OnDisable() { playing = false; }

    [ContextMenu("Reload Sprite Check files")]
    public void Reload()
    {
        ReleaseSprites();
        target = GetComponent<SpriteRenderer>();
        manifest = null;
        if (!manifestJson || !spriteSheet) return;
        try
        {
            var data = JsonUtility.FromJson<Manifest>(manifestJson.text);
            if (data == null || data.format != "sprite-check" || data.version != 1 || data.coordinateOrigin != "top-left")
                throw new Exception("Unsupported Sprite Check JSON format/version/origin.");
            if (data.width != spriteSheet.width || data.height != spriteSheet.height)
                throw new Exception("PNG dimensions differ from JSON. Disable NPOT resizing and use a sufficient Max Size in the texture importer.");
            if (data.frames == null || data.animations == null || data.animations.Length == 0)
                throw new Exception("Missing frame or animation arrays.");
            for (int i = 0; i < data.frames.Length; i++)
            {
                var f = data.frames[i];
                if (f.id != i || f.x < 0 || f.y < 0 || f.width <= 0 || f.height <= 0 || f.x + f.width > data.width || f.y + f.height > data.height)
                    throw new Exception("Invalid sprite rectangle or frame ID.");
            }
            foreach (var animation in data.animations)
            {
                if (animation.fps <= 0 || animation.timeline == null) throw new Exception("Invalid animation data.");
                long total = 0;
                foreach (var key in animation.timeline)
                {
                    if (key.frame < 0 || key.frame >= data.frames.Length || key.ticks < 1) throw new Exception("Invalid timeline reference/duration.");
                    total += key.ticks;
                }
                if (total != animation.totalTicks) throw new Exception("Timeline totalTicks does not match its keys.");
            }
            sprites = new Sprite[data.frames.Length];
            var pivot = data.pivot == null ? new Vector2(.5f, .08f) : new Vector2(data.pivot.x, data.pivot.y);
            for (int i = 0; i < sprites.Length; i++)
            {
                var f = data.frames[i];
                sprites[i] = Sprite.Create(spriteSheet, new Rect(f.x, data.height - f.y - f.height, f.width, f.height), pivot,
                    Mathf.Max(1, data.pixelsPerUnit), 0, SpriteMeshType.FullRect);
                sprites[i].name = "SpriteCheck_" + i;
            }
            manifest = data;
            animationIndex = Mathf.Clamp(animationIndex, 0, data.animations.Length - 1);
            elapsed = 0;
            ApplyFrame();
        }
        catch (Exception error)
        {
            ReleaseSprites();
            Debug.LogError("Sprite Check: " + error.Message, this);
        }
    }

    public void Play(int index, bool restart = true)
    {
        if (manifest == null || index < 0 || index >= manifest.animations.Length) return;
        animationIndex = index;
        if (restart) elapsed = 0;
        playing = true;
        ApplyFrame();
    }
    public void Pause() { playing = false; }
    public void SeekSeconds(float seconds) { elapsed = Math.Max(0, seconds); ApplyFrame(); }
    void Update()
    {
        if (manifest == null) return;
        if (playing) elapsed += Time.deltaTime * playbackSpeed;
        ApplyFrame();
    }
    void ApplyFrame()
    {
        if (manifest == null || !target || animationIndex < 0 || animationIndex >= manifest.animations.Length) return;
        var animation = manifest.animations[animationIndex];
        if (animation.totalTicks == 0) { target.sprite = null; return; }
        long tick = (long)Math.Floor(elapsed * animation.fps + .0000001);
        bool repeats = useAnimationLoop ? animation.loop : loop;
        if (repeats) tick %= animation.totalTicks;
        else if (tick >= animation.totalTicks) { tick = animation.totalTicks - 1; playing = false; }
        foreach (var key in animation.timeline)
        {
            if (tick < key.ticks) { target.sprite = sprites[key.frame]; return; }
            tick -= key.ticks;
        }
    }
    void ReleaseSprites()
    {
        if (sprites == null) return;
        foreach (var sprite in sprites) if (sprite) { if (Application.isPlaying) Destroy(sprite); else DestroyImmediate(sprite); }
        sprites = null;
    }
    void OnDestroy() { ReleaseSprites(); }
}

/**
 * MP3 Visualizer App
 */

// --- Global Variables ---
let audioContext = null;
let analyser = null;
let sourceNode = null;
let audio = new Audio();
let playlist = []; // { file, title, artist, coverURL, url, duration }
let currentIndex = -1;
let isPlaying = false;
let currentTheme = '1';
let animationId = null;
let currentThemeObj = null;
const themes = {};

// Playback modes
let repeatMode = 'normal'; // 'normal', 'repeat-all', 'repeat-one'
let isShuffle = false;
let shuffleQueue = [];
let defaultCover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";

// --- DOM Elements ---
const dom = {
    fileInput: document.getElementById('file-input'),
    dropOverlay: document.getElementById('drop-overlay'),
    playlistContainer: document.getElementById('playlist'),
    trackCount: document.getElementById('track-count'),
    themeSelector: document.getElementById('theme-selector'),
    
    // Player
    btnPlayPause: document.getElementById('play-pause-btn'),
    iconPlayPause: document.getElementById('play-icon'),
    btnPrev: document.getElementById('prev-btn'),
    btnNext: document.getElementById('next-btn'),
    btnShuffle: document.getElementById('shuffle-btn'),
    btnRepeat: document.getElementById('repeat-btn'),
    iconRepeat: document.getElementById('repeat-icon'),
    seekBar: document.getElementById('seek-bar'),
    timeCurrent: document.getElementById('time-current'),
    timeTotal: document.getElementById('time-total'),
    volumeBar: document.getElementById('volume-bar'),
    btnVolume: document.getElementById('mute-btn'),
    iconVolume: document.getElementById('volume-icon'),
    
    // Now Playing Info
    currentTitle: document.getElementById('current-title'),
    currentArtist: document.getElementById('current-artist'),
    currentCover: document.getElementById('current-cover'),
    bgArtwork: document.getElementById('bg-artwork'),
    
    // Visualizer Layers
    canvas: document.getElementById('visualizer-canvas'),
    ctx: document.getElementById('visualizer-canvas').getContext('2d'),
    canvasThree: document.getElementById('visualizer-three'),
    layerDom: document.getElementById('visualizer-dom'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// --- Initialization ---
function init() {
    setupEventListeners();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Auto-init theme 1 on boot
    setTimeout(() => {
        switchTheme('1');
    }, 100);
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // For smooth visualization
        
        sourceNode = audioContext.createMediaElementSource(audio);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    dom.fileInput.addEventListener('change', handleFileSelect);
    
    // Drag & Drop
    const body = document.body;
    body.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.dropOverlay.classList.remove('hidden');
        dom.dropOverlay.classList.add('active');
    });
    
    dom.dropOverlay.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dom.dropOverlay.classList.remove('active');
        setTimeout(() => dom.dropOverlay.classList.add('hidden'), 300);
    });
    
    dom.dropOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.dropOverlay.classList.remove('active');
        setTimeout(() => dom.dropOverlay.classList.add('hidden'), 300);
        
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // Theme selector
    dom.themeSelector.addEventListener('change', (e) => {
        switchTheme(e.target.value);
    });

    // Player Controls
    dom.btnPlayPause.addEventListener('click', togglePlay);
    dom.btnNext.addEventListener('click', () => playNext(true));
    dom.btnPrev.addEventListener('click', playPrev);
    dom.btnShuffle.addEventListener('click', toggleShuffle);
    dom.btnRepeat.addEventListener('click', toggleRepeat);

    // Audio element
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleTrackEnd);
    audio.addEventListener('loadedmetadata', () => {
        dom.timeTotal.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('play', () => {
        isPlaying = true;
        dom.iconPlayPause.textContent = 'pause';
        if (!animationId) drawVisualizer();
    });
    audio.addEventListener('pause', () => {
        isPlaying = false;
        dom.iconPlayPause.textContent = 'play_arrow';
    });
    audio.addEventListener('error', () => {
        showToast("Error reading audio data. Skipping track.");
        setTimeout(() => playNext(true), 2000);
    });

    // Seek bar
    let isSeeking = false;
    dom.seekBar.addEventListener('mousedown', () => isSeeking = true);
    dom.seekBar.addEventListener('touchstart', () => isSeeking = true);
    dom.seekBar.addEventListener('mouseup', () => isSeeking = false);
    dom.seekBar.addEventListener('touchend', () => isSeeking = false);
    
    dom.seekBar.addEventListener('input', (e) => {
        if (audio.duration) {
            const time = (e.target.value / 100) * audio.duration;
            if (isSeeking) {
                 dom.timeCurrent.textContent = formatTime(time);
            } else {
                 audio.currentTime = time;
            }
        }
    });
    dom.seekBar.addEventListener('change', (e) => {
        if (audio.duration) {
             audio.currentTime = (e.target.value / 100) * audio.duration;
        }
    });

    // Volume
    dom.volumeBar.addEventListener('input', (e) => {
        audio.volume = e.target.value / 100;
        updateVolumeIcon();
    });
    
    dom.btnVolume.addEventListener('click', () => {
        if (audio.volume > 0) {
            audio.dataset.prevVol = audio.volume;
            audio.volume = 0;
            dom.volumeBar.value = 0;
        } else {
            audio.volume = audio.dataset.prevVol || 1;
            dom.volumeBar.value = audio.volume * 100;
        }
        updateVolumeIcon();
    });
}

// --- Audio & File Handling ---
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
}

async function handleFiles(files) {
    const jsmediatags = window.jsmediatags;
    if (!jsmediatags) {
        showToast("Error: jsmediatags not loaded.");
        return;
    }

    const newTracks = [];
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.match('audio/mp.*')) {
            showToast(`Skipped ${file.name}: Not an MP3 file.`);
            continue;
        }

        try {
            const tags = await readTags(file);
            let coverURL = defaultCover;
            if (tags.picture) {
                let base64String = "";
                for (let j = 0; j < tags.picture.data.length; j++) {
                    base64String += String.fromCharCode(tags.picture.data[j]);
                }
                const base64 = btoa(base64String);
                coverURL = `data:${tags.picture.format};base64,${base64}`;
            }

            const trackURL = URL.createObjectURL(file);
            newTracks.push({
                file: file,
                title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                artist: tags.artist || "Unknown Artist",
                coverURL: coverURL,
                url: trackURL
            });
        } catch (err) {
            console.error(err);
            errorCount++;
            // Fallback
            const trackURL = URL.createObjectURL(file);
            newTracks.push({
                file: file,
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: "Unknown Artist",
                coverURL: defaultCover,
                url: trackURL
            });
        }
    }

    if (errorCount > 0) {
        showToast(`Could not read metadata for ${errorCount} file(s).`);
    }

    playlist = playlist.concat(newTracks);
    dom.trackCount.textContent = `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`;
    
    updateShuffleQueue();
    renderPlaylist();

    if (currentIndex === -1 && playlist.length > 0) {
        playTrack(0);
    }
}

function readTags(file) {
    return new Promise((resolve, reject) => {
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                resolve(tag.tags);
            },
            onError: function(error) {
                reject(error);
            }
        });
    });
}

// --- Playlist Management ---
function renderPlaylist() {
    dom.playlistContainer.innerHTML = '';
    
    if (playlist.length === 0) {
        dom.playlistContainer.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">queue_music</span>
                <p>No tracks in playlist.<br>Drag & drop MP3 files or click the + button.</p>
            </div>
        `;
        return;
    }

    playlist.forEach((track, index) => {
        const div = document.createElement('div');
        div.className = `track-item ${currentIndex === index ? 'playing' : ''}`;
        div.onclick = () => playTrack(index);
        
        div.innerHTML = `
            <div class="track-index">${index + 1}</div>
            <div class="playing-icon">
                <span class="material-symbols-rounded">equalizer</span>
            </div>
            <div class="track-info-list">
                <h4 class="truncate">${track.title}</h4>
                <p class="truncate">${track.artist}</p>
            </div>
        `;
        dom.playlistContainer.appendChild(div);
    });
}

function updateShuffleQueue() {
    shuffleQueue = Array.from(Array(playlist.length).keys());
    if (isShuffle) {
        // Fisher-Yates shuffle
        for (let i = shuffleQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffleQueue[i], shuffleQueue[j]] = [shuffleQueue[j], shuffleQueue[i]];
        }
    }
}

function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    
    initAudioContext();
    
    currentIndex = index;
    const track = playlist[index];
    
    audio.src = track.url;
    audio.load();
    audio.play().catch(e => {
        console.error("Autoplay prevented:", e);
        showToast("Click play to start audio.");
    });
    
    // Update UI
    dom.currentTitle.textContent = track.title;
    dom.currentArtist.textContent = track.artist;
    dom.currentCover.src = track.coverURL;
    dom.bgArtwork.style.backgroundImage = `url(${track.coverURL})`;
    
    renderPlaylist(); // Update selected state
}

function togglePlay() {
    if (playlist.length === 0) return;
    initAudioContext();
    
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
}

function playNext(forceNext = false) {
    if (playlist.length === 0) return;
    
    let nextIndex;
    
    if (isShuffle) {
        // Find current in shuffle queue and go to next
        const qIdx = shuffleQueue.indexOf(currentIndex);
        if (qIdx < shuffleQueue.length - 1) {
            nextIndex = shuffleQueue[qIdx + 1];
        } else {
            nextIndex = shuffleQueue[0];
            if (repeatMode === 'normal' && !forceNext) {
                // Done playing queue
                audio.pause();
                return;
            }
        }
    } else {
        nextIndex = currentIndex + 1;
        if (nextIndex >= playlist.length) {
            nextIndex = 0;
            if (repeatMode === 'normal' && !forceNext) {
                audio.pause();
                return;
            }
        }
    }
    
    playTrack(nextIndex);
}

function playPrev() {
    if (playlist.length === 0) return;
    
    // If > 3 seconds, restart current track
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    
    let prevIndex;
    if (isShuffle) {
        const qIdx = shuffleQueue.indexOf(currentIndex);
        if (qIdx > 0) {
            prevIndex = shuffleQueue[qIdx - 1];
        } else {
            prevIndex = shuffleQueue[shuffleQueue.length - 1]; // last in queue
        }
    } else {
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
            prevIndex = playlist.length - 1;
        }
    }
    
    playTrack(prevIndex);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    dom.btnShuffle.classList.toggle('active', isShuffle);
    updateShuffleQueue();
    // Keep current track at the start of new shuffle queue
    if (isShuffle && currentIndex !== -1) {
        const qIdx = shuffleQueue.indexOf(currentIndex);
        [shuffleQueue[0], shuffleQueue[qIdx]] = [shuffleQueue[qIdx], shuffleQueue[0]];
    }
    showToast(isShuffle ? "Shuffle On" : "Shuffle Off");
}

function toggleRepeat() {
    if (repeatMode === 'normal') {
        repeatMode = 'repeat-all';
        dom.btnRepeat.classList.add('active');
        dom.iconRepeat.textContent = 'repeat';
        showToast("Repeat All");
    } else if (repeatMode === 'repeat-all') {
        repeatMode = 'repeat-one';
        dom.btnRepeat.classList.add('active');
        dom.iconRepeat.textContent = 'repeat_one';
        showToast("Repeat One");
    } else {
        repeatMode = 'normal';
        dom.btnRepeat.classList.remove('active');
        dom.iconRepeat.textContent = 'repeat';
        showToast("Repeat Off");
    }
}

function handleTrackEnd() {
    if (repeatMode === 'repeat-one') {
        audio.currentTime = 0;
        audio.play();
    } else {
        playNext();
    }
}

// --- Utilities ---
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgress() {
    if (!audio.duration) return;
    const percent = (audio.currentTime / audio.duration) * 100;
    // Only update slider visual if not seeking
    dom.seekBar.value = percent;
    dom.timeCurrent.textContent = formatTime(audio.currentTime);
}

function updateVolumeIcon() {
    if (audio.volume === 0) {
        dom.iconVolume.textContent = 'volume_off';
    } else if (audio.volume < 0.5) {
        dom.iconVolume.textContent = 'volume_down';
    } else {
        dom.iconVolume.textContent = 'volume_up';
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3300);
}

// --- Visualizer Engines ---
function resizeCanvas() {
    const rect = dom.canvas.parentElement.getBoundingClientRect();
    dom.canvas.width = rect.width;
    dom.canvas.height = rect.height;
    
    if (currentThemeObj && currentThemeObj.resize) {
        currentThemeObj.resize(rect.width, rect.height);
    }
}

function switchTheme(themeId) {
    if (currentThemeObj && currentThemeObj.destroy) {
        currentThemeObj.destroy();
    }
    
    currentTheme = themeId;
    dom.themeSelector.value = themeId;
    currentThemeObj = themes[themeId];
    
    // Hide all layers
    dom.canvas.style.display = 'none';
    dom.canvasThree.style.display = 'none';
    dom.layerDom.style.display = 'none';
    dom.layerDom.innerHTML = ''; // clear DOM
    
    if (!currentThemeObj) return;
    
    if (currentThemeObj.layer === 'three') {
        dom.canvasThree.style.display = 'block';
    } else if (currentThemeObj.layer === 'dom') {
        dom.layerDom.style.display = 'flex';
    } else {
        dom.canvas.style.display = 'block';
    }
    
    if (currentThemeObj.init) {
        const rect = dom.canvas.parentElement.getBoundingClientRect();
        currentThemeObj.init(rect.width, rect.height);
    }
}

function drawVisualizer() {
    if (!analyser) return;
    
    // Schedule next frame
    animationId = requestAnimationFrame(drawVisualizer);
    
    if (!isPlaying) {
        // Continue drawing frame so effects can decay, but dont advance logic much
        // For some themes, we might want idle animations
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    const timeData = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(timeData);
    
    // Extract Audio Features
    let bassSum = 0;
    for (let i = 0; i < 10; i++) bassSum += dataArray[i];
    const bass = bassSum / 10;
    
    let midSum = 0;
    for (let i = 10; i < 100; i++) midSum += dataArray[i];
    const mid = midSum / 90;
    
    let trebleSum = 0;
    for (let i = 100; i < 250; i++) trebleSum += dataArray[i];
    const treble = trebleSum / 150;
    
    const audioData = {
        bufferLength,
        dataArray,
        timeData,
        bass,
        mid,
        treble
    };
    
    const cw = dom.canvas.width;
    const ch = dom.canvas.height;
    
    if (currentThemeObj && currentThemeObj.update) {
        currentThemeObj.update(audioData, cw, ch);
    }
}

// --- Themes Implementation ---

// Theme 1: Gate (Three.js Warp Tunnel)
themes['1'] = {
    layer: 'three',
    scene: null,
    camera: null,
    renderer: null,
    geometry: null,
    material: null,
    points: null,
    baseFov: 75,
    init: function(width, height) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(this.baseFov, width / height, 0.1, 1000);
        this.camera.position.z = 0;
        
        this.renderer = new THREE.WebGLRenderer({ canvas: dom.canvasThree, alpha: true, antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Create tunnel particles
        this.geometry = new THREE.BufferGeometry();
        const particlesCount = 2000;
        const posArray = new Float32Array(particlesCount * 3);
        
        for(let i = 0; i < particlesCount * 3; i+=3) {
            // cylindrical distribution around z-axis
            const radius = 3 + Math.random() * 20;
            const theta = Math.random() * Math.PI * 2;
            posArray[i] = Math.cos(theta) * radius; // x
            posArray[i+1] = Math.sin(theta) * radius; // y
            posArray[i+2] = (Math.random() - 0.5) * 200; // z
        }
        
        this.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        this.material = new THREE.PointsMaterial({
            size: 0.15,
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        this.points = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.points);
        
        // Grid helper to look like Tron/Gate
        const gridHelper = new THREE.GridHelper(50, 50, 0x00ffff, 0x004488);
        gridHelper.position.y = -8;
        this.scene.add(gridHelper);
        this.grid = gridHelper;
    },
    update: function(audioData, cw, ch) {
        if (!this.renderer) return;
        
        const isAudioActive = isPlaying && audioData.bass > 0;
        
        // Speed up tunnel on bass + general advancement
        const speed = isAudioActive ? 0.3 + (audioData.bass / 255) * 3.0 : 0.1;
        
        // Move particles towards camera
        const positions = this.geometry.attributes.position.array;
        for(let i=2; i<positions.length; i+=3) {
            positions[i] += speed;
            if(positions[i] > 20) {
                positions[i] -= 200; // wrap around deep back
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        
        // Move grid to create illusion of forward movement
        this.grid.position.z += speed;
        if(this.grid.position.z > 1) {
            this.grid.position.z -= 1; // loop
        }
        
        // Kick effect: FOV pulse
        const targetFov = this.baseFov + (audioData.bass / 255) * 40; // Max +40 FOV on heavy bass
        this.camera.fov += (targetFov - this.camera.fov) * 0.15; // Smooth lerp
        
        // Camera shake on very high bass
        if (audioData.bass > 200) {
            const shake = (audioData.bass - 200) / 55 * 0.5;
            this.camera.position.x = (Math.random() - 0.5) * shake;
            this.camera.position.y = (Math.random() - 0.5) * shake;
        } else {
            this.camera.position.x += (0 - this.camera.position.x) * 0.1;
            this.camera.position.y += (0 - this.camera.position.y) * 0.1;
        }
        
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
    },
    resize: function(width, height) {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },
    destroy: function() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
        if (this.renderer) this.renderer.dispose();
        this.scene = null;
        this.camera = null;
        this.renderer = null;
    }
};

// Theme 2: Balloon (Canvas Physics)
themes['2'] = {
    layer: 'canvas',
    balloons: [],
    init: function(w, h) {
        this.balloons = [];
        const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55'];
        for(let i = 0; i < 25; i++) {
            this.balloons.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                radius: 20 + Math.random() * 40,
                color: colors[Math.floor(Math.random() * colors.length)],
                vibrate: 0
            });
        }
    },
    update: function(audioData, cw, ch) {
        const ctx = dom.ctx;
        // Background
        ctx.fillStyle = "#0a0a0c";
        ctx.fillRect(0, 0, cw, ch);
        
        // Physics update
        const bassForce = (audioData.bass > 180) ? (audioData.bass - 180) * 0.15 : 0;
        const trebleVibe = (audioData.treble > 120) ? (audioData.treble - 120) * 0.05 : 0;
        
        for (let i = 0; i < this.balloons.length; i++) {
            let b = this.balloons[i];
            
            // Float upwards slightly + bass push
            b.vy -= 0.05 + (bassForce * 0.3);
            
            // Friction
            b.vx *= 0.99;
            b.vy *= 0.99;
            
            // Move
            b.x += b.vx;
            b.y += b.vy;
            
            // Walls
            if (b.x < b.radius) { b.x = b.radius; b.vx *= -0.8; }
            if (b.x > cw - b.radius) { b.x = cw - b.radius; b.vx *= -0.8; }
            
            // Floor/Ceil - balloons bounce on the ceiling and floor
            if (b.y < b.radius) { b.y = b.radius; b.vy *= -0.8; }
            if (b.y > ch - b.radius) { b.y = ch - b.radius; b.vy *= -0.8; }
            
            // Tremble
            b.vibrate = trebleVibe;
            
            // Collisions
            for (let j = i + 1; j < this.balloons.length; j++) {
                let b2 = this.balloons[j];
                const dx = b2.x - b.x;
                const dy = b2.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = b.radius + b2.radius;
                
                if (dist < minDist) {
                    const overlap = minDist - dist;
                    const angle = Math.atan2(dy, dx);
                    
                    // Simple resolution
                    const force = overlap * 0.1;
                    const fx = Math.cos(angle) * force;
                    const fy = Math.sin(angle) * force;
                    
                    b.vx -= fx;
                    b.vy -= fy;
                    b2.vx += fx;
                    b2.vy += fy;
                }
            }
        }
        
        // Draw
        for (let b of this.balloons) {
            ctx.beginPath();
            
            const vx = (Math.random() - 0.5) * b.vibrate * 5;
            const vy = (Math.random() - 0.5) * b.vibrate * 5;
            
            ctx.arc(b.x + vx, b.y + vy, b.radius, 0, Math.PI * 2);
            
            // Balloon styling
            const gradient = ctx.createRadialGradient(
                b.x - b.radius * 0.3 + vx, b.y - b.radius * 0.3 + vy, b.radius * 0.1,
                b.x + vx, b.y + vy, b.radius
            );
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, b.color);
            gradient.addColorStop(1, '#000000');
            
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    },
    resize: function(w, h) {},
    destroy: function() { this.balloons = []; }
};

// Theme 3: Glow (Canvas Fluid Lines)
themes['3'] = {
    layer: 'canvas',
    time: 0,
    init: function(w, h) {
        this.time = 0;
    },
    update: function(audioData, cw, ch) {
        const ctx = dom.ctx;
        
        // Fade out
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = "rgba(5, 5, 10, 0.15)";
        ctx.fillRect(0, 0, cw, ch);
        
        if (!isPlaying && audioData.bass === 0) {
            this.time += 0.005; // Idle
        } else {
            const energy = audioData.mid / 255;
            this.time += 0.01 + energy * 0.05;
        }
        
        ctx.globalCompositeOperation = 'screen';
        
        const linesCount = 6;
        const colorBase = (audioData.treble > audioData.bass * 1.5) ? 200 : 340; // Blue vs Red/Pink hue
        const energy = audioData.mid / 255;
        
        for (let j = 0; j < linesCount; j++) {
            ctx.beginPath();
            let startY = ch / 2 + Math.sin(this.time + j) * ch * 0.3;
            ctx.moveTo(0, startY);
            
            for (let i = 0; i <= cw; i += 20) {
                const nx = i / 200 + this.time + j * 0.5;
                const ny = Math.sin(nx) * Math.cos(nx * 0.8) * Math.sin(nx * 0.3);
                
                // Add audio reaction
                const audioPulse = (audioData.bass / 255) * Math.sin(i * 0.05 + this.time * 10);
                
                const y = ch / 2 + (ny * ch * 0.4) + audioPulse * 150;
                ctx.lineTo(i, y);
            }
            
            ctx.lineWidth = 2 + energy * 8;
            const hue = colorBase + j * 15 + (audioData.bass / 255) * 50;
            ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.8)`;
            ctx.stroke();
            
            // Inner core
            ctx.lineWidth = 1 + energy * 2;
            ctx.strokeStyle = `hsla(${hue}, 100%, 95%, 1)`;
            ctx.stroke();
        }
        
        ctx.globalCompositeOperation = 'source-over';
    },
    resize: function(w, h) {},
    destroy: function() {}
};

// Theme 4: Animal (Canvas Silhouettes)
themes['4'] = {
    layer: 'canvas',
    deerY: 0,
    birds: [],
    grass: [],
    init: function(w, h) {
        this.deerY = 0;
        this.birds = [];
        this.grass = [];
        for(let i=0; i<w; i+=10) {
            this.grass.push(Math.random() * 20 + 10);
        }
    },
    update: function(audioData, cw, ch) {
        const ctx = dom.ctx;
        ctx.fillStyle = "#1e293b"; // Dark slate background
        ctx.fillRect(0, 0, cw, ch);
        
        // Ground
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, ch - 80, cw, 80);
        
        const groundY = ch - 80;
        const beat = audioData.bass > 200;
        
        // Grass
        ctx.fillStyle = "#334155";
        for(let i=0; i<this.grass.length; i++) {
            const h = this.grass[i] + (audioData.mid / 255) * 10;
            ctx.fillRect(i * 10, groundY - h, 5, h);
        }
        
        // Deer Jump on beat
        if (beat && this.deerY === 0) {
            this.deerY = 50 + Math.random() * 50;
        }
        if (this.deerY > 0) {
            this.deerY -= 4; // gravity
            if(this.deerY < 0) this.deerY = 0;
        }
        
        // Draw Deer
        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        // simple deer shape
        const dx = cw / 2 - 40;
        const dy = groundY - 60 - Math.max(0, this.deerY);
        ctx.roundRect(dx, dy, 50, 40, 10); // body
        ctx.roundRect(dx + 35, dy - 30, 20, 30, 5); // neck/head
        ctx.fill();
        
        // Birds on crescendo
        if (audioData.treble > 180 && Math.random() > 0.8) {
            this.birds.push({ x: 0, y: ch / 2 - 50 + Math.random() * 100, vy: -1 - Math.random() * 2 });
        }
        
        ctx.fillStyle = "#94a3b8";
        for(let i=0; i<this.birds.length; i++) {
            let b = this.birds[i];
            b.x += 5;
            b.y += Math.sin(b.x * 0.1) * 2 + b.vy;
            
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - 10, b.y - 10 + Math.sin(b.x * 0.2) * 5);
            ctx.lineTo(b.x - 20, b.y);
            ctx.fill();
            
            if (b.x > cw) {
                this.birds.splice(i, 1);
                i--;
            }
        }
    },
    resize: function(w, h) {},
    destroy: function() { this.birds = []; }
};

// Theme 5: Albums (CSS 3D)
themes['5'] = {
    layer: 'dom',
    elements: [],
    angle: 0,
    init: function(w, h) {
        this.angle = 0;
        const layer = dom.layerDom;
        layer.innerHTML = "";
        
        const count = 8;
        this.elements = [];
        
        for(let i=0; i<count; i++) {
            const el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.width = '150px';
            el.style.height = '150px';
            el.style.backgroundImage = `url(${playlist.length > 0 ? playlist[i % playlist.length].coverURL : defaultCover})`;
            el.style.backgroundSize = 'cover';
            el.style.borderRadius = '8px';
            el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            el.style.transition = 'transform 0.1s ease-out';
            layer.appendChild(el);
            this.elements.push(el);
        }
        
        // Center main cover
        this.centerObj = document.createElement('div');
        this.centerObj.style.position = 'absolute';
        this.centerObj.style.width = '200px';
        this.centerObj.style.height = '200px';
        this.centerObj.style.backgroundImage = `url(${currentIndex >= 0 && playlist[currentIndex] ? playlist[currentIndex].coverURL : defaultCover})`;
        this.centerObj.style.backgroundSize = 'cover';
        this.centerObj.style.borderRadius = '12px';
        this.centerObj.style.boxShadow = '0 0 50px rgba(0, 210, 255, 0.4)';
        layer.appendChild(this.centerObj);
    },
    update: function(audioData, cw, ch) {
        if (this.elements.length === 0) return;
        
        const moveSpeed = (audioData.bass > 150) ? 0.02 + (audioData.bass / 255) * 0.05 : 0.005;
        this.angle += isPlaying ? moveSpeed : 0.002;
        
        const radius = 250 + (audioData.mid / 255) * 50;
        
        for(let i=0; i<this.elements.length; i++) {
            const el = this.elements[i];
            const theta = this.angle + (i * Math.PI * 2 / this.elements.length);
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;
            const rotateY = -theta + Math.PI/2;
            
            const scale = 1 + (audioData.treble / 255) * 0.2;
            el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${rotateY}rad) scale(${scale})`;
        }
        
        // Center pulse
        const centerScale = 1 + (audioData.bass / 255) * 0.3;
        const blur = (audioData.bass / 255) * 10;
        this.centerObj.style.transform = `scale(${centerScale})`;
        this.centerObj.style.filter = `drop-shadow(0 0 ${20 + blur * 2}px rgba(0, 210, 255, ${0.5 + audioData.bass/500}))`;
        
        if (currentIndex >= 0 && playlist[currentIndex]) {
           this.centerObj.style.backgroundImage = `url(${playlist[currentIndex].coverURL})`;
        }
    },
    resize: function(w, h) {},
    destroy: function() {
        this.elements = [];
        this.centerObj = null;
    }
};

for(let i=6; i<=8; i++) {
    themes[i.toString()] = {
        layer: 'canvas',
        init: function(w, h) {},
        update: function(audioData, cw, ch) {
            dom.ctx.fillStyle = "rgba(10,12,16,0.5)";
            dom.ctx.fillRect(0, 0, cw, ch);
            dom.ctx.fillStyle = "white";
            dom.ctx.font = "24px Outfit";
            dom.ctx.textAlign = "center";
            dom.ctx.fillText(`Theme ${i} is under construction...`, cw/2, ch/2);
        },
        resize: function(w, h) {},
        destroy: function() {}
    };
}

// Theme 6: Graffiti (Canvas Splats)
themes['6'] = {
    layer: 'canvas',
    splats: [],
    dripSpeed: 0.5,
    init: function(w, h) {
        this.splats = [];
        this.dripSpeed = 0.5;
    },
    update: function(audioData, cw, ch) {
        const ctx = dom.ctx;
        // Keep previous splats but fade slightly
        ctx.fillStyle = "rgba(10, 15, 20, 0.05)";
        ctx.fillRect(0, 0, cw, ch);
        
        const isSnare = audioData.treble > 150 && audioData.mid > 180;
        const isKick = audioData.bass > 220;
        
        if (isKick) {
            this.dripSpeed = 2.0; // Fast drip on kick
        } else {
            this.dripSpeed *= 0.95; // Decay
            if (this.dripSpeed < 0.2) this.dripSpeed = 0.2;
        }
        
        if (isSnare && Math.random() > 0.5) {
            // New splat
            const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
            const x = Math.random() * cw;
            const y = Math.random() * (ch * 0.6);
            const size = 20 + Math.random() * 50;
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Core splat
            this.splats.push({x, y, size, color, life: 1.0, type: 'core'});
            
            // Drips
            for(let i=0; i<3; i++) {
                this.splats.push({
                    x: x + (Math.random()-0.5)*size, 
                    y: y + (Math.random()-0.5)*size, 
                    size: size * (0.1 + Math.random() * 0.2), 
                    color: color, 
                    life: 1.0, 
                    type: 'drip'
                });
            }
        }
        
        for (let i = 0; i < this.splats.length; i++) {
            let s = this.splats[i];
            
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
            ctx.fill();
            
            if (s.type === 'drip') {
                s.y += this.dripSpeed;
            }
            s.life -= 0.002;
            
            if (s.life <= 0 || s.y > ch + s.size) {
                this.splats.splice(i, 1);
                i--;
            }
        }
    },
    resize: function(w, h) {},
    destroy: function() { this.splats = []; }
};

// Theme 7: Ink (Metaballs with SVG Filter)
themes['7'] = {
    layer: 'canvas',
    drops: [],
    init: function(w, h) {
        this.drops = [];
        dom.canvas.style.filter = "url('#goo')";
        const colors = ['#00d2ff', '#3a7bd5', '#93c5fd', '#1e40af'];
        // Initial big blobs
        for(let i=0; i<3; i++) {
            this.drops.push({
                x: w/2 + (Math.random()-0.5)*100,
                y: h/2 + (Math.random()-0.5)*100,
                vx: (Math.random()-0.5)*2,
                vy: (Math.random()-0.5)*2,
                r: 80 + Math.random()*50,
                c: colors[i%colors.length]
            });
        }
    },
    update: function(audioData, cw, ch) {
        const ctx = dom.ctx;
        ctx.clearRect(0, 0, cw, ch);
        
        const energy = audioData.mid / 255;
        const kick = audioData.bass > 210;
        
        if (kick && Math.random() > 0.5 && this.drops.length < 15) {
            const colors = ['#00d2ff', '#3a7bd5', '#93c5fd', '#1e40af'];
            this.drops.push({
                x: cw/2,
                y: ch/2,
                vx: (Math.random()-0.5)*(10 + energy*10),
                vy: (Math.random()-0.5)*(10 + energy*10),
                r: 30 + Math.random()*40,
                c: colors[Math.floor(Math.random()*colors.length)]
            });
        }
        
        for(let i=0; i<this.drops.length; i++) {
            let d = this.drops[i];
            
            // apply swirling force
            const dx = cw/2 - d.x;
            const dy = ch/2 - d.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Centripetal + audio bounce
            if(dist > 50) {
                d.vx += (dx / dist) * 0.1;
                d.vy += (dy / dist) * 0.1;
            }
            
            // Audio expands blobs
            const radiusScale = 1 + (audioData.bass/255) * 0.5;
            
            d.x += d.vx * (1 + energy*2);
            d.y += d.vy * (1 + energy*2);
            
            // Damping
            d.vx *= 0.98;
            d.vy *= 0.98;
            
            ctx.fillStyle = d.c;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r * radiusScale, 0, Math.PI*2);
            ctx.fill();
        }
    },
    resize: function(w, h) {},
    destroy: function() {
        this.drops = [];
        dom.canvas.style.filter = "none";
    }
};

// Theme 8: Random (Auto-Switcher)
themes['8'] = {
    layer: 'none', // special handling
    timer: 0,
    activeSubTheme: null,
    subThemeId: '1',
    switchInterval: 10000,
    lastSwitch: 0,
    init: function(w, h) {
        this.lastSwitch = Date.now();
        this.pickRandom();
    },
    pickRandom: function() {
        if(this.activeSubTheme && this.activeSubTheme.destroy) {
            this.activeSubTheme.destroy();
        }
        
        const available = ['1', '2', '3', '4', '5', '6', '7'];
        const choice = available[Math.floor(Math.random() * available.length)];
        this.subThemeId = choice;
        this.activeSubTheme = themes[choice];
        
        dom.canvas.style.display = 'none';
        dom.canvasThree.style.display = 'none';
        dom.layerDom.style.display = 'none';
        dom.layerDom.innerHTML = '';
        
        if (this.activeSubTheme.layer === 'three') dom.canvasThree.style.display = 'block';
        else if (this.activeSubTheme.layer === 'dom') dom.layerDom.style.display = 'flex';
        else dom.canvas.style.display = 'block';
        
        if(this.activeSubTheme.init) {
            const rect = dom.canvas.parentElement.getBoundingClientRect();
            this.activeSubTheme.init(rect.width, rect.height);
        }
    },
    update: function(audioData, cw, ch) {
        const now = Date.now();
        if (now - this.lastSwitch > this.switchInterval) {
            if (audioData.bass > 230 || now - this.lastSwitch > 20000) {
                this.pickRandom();
                this.lastSwitch = now;
            }
        }
        
        if (this.activeSubTheme && this.activeSubTheme.update) {
            this.activeSubTheme.update(audioData, cw, ch);
        }
    },
    resize: function(w, h) {
        if(this.activeSubTheme && this.activeSubTheme.resize) {
            this.activeSubTheme.resize(w, h);
        }
    },
    destroy: function() {
        if(this.activeSubTheme && this.activeSubTheme.destroy) {
            this.activeSubTheme.destroy();
        }
        this.activeSubTheme = null;
        dom.canvas.style.display = 'none';
        dom.canvasThree.style.display = 'none';
        dom.layerDom.style.display = 'none';
    }
};
\n// Boot
window.addEventListener('DOMContentLoaded', init);

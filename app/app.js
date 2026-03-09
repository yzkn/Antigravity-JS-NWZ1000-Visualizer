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
    
    // Canvas
    canvas: document.getElementById('visualizer-canvas'),
    ctx: document.getElementById('visualizer-canvas').getContext('2d'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// --- Initialization ---
function init() {
    setupEventListeners();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
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
        currentTheme = e.target.value;
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
}

// Variables for theming engines
let particlesArray = [];
let rotationAngle = 0;

function drawVisualizer() {
    if (!analyser) return;
    
    // Schedule next frame immediately
    animationId = requestAnimationFrame(drawVisualizer);
    
    const cw = dom.canvas.width;
    const ch = dom.canvas.height;
    const ctx = dom.ctx;
    
    // Buffer for Frequency Data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Default semi-transparent fade
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, cw, ch);
    
    if (!isPlaying) {
        // Keep idle drawing smoothly
        return;
    }

    analyser.getByteFrequencyData(dataArray);

    switch (currentTheme) {
        case '1': drawWaveform(ctx, cw, ch); break;
        case '2': drawSpectrumBars(ctx, cw, ch, dataArray, bufferLength); break;
        case '3': drawCircleEQ(ctx, cw, ch, dataArray, bufferLength); break;
        case '4': drawVinyl(ctx, cw, ch, dataArray); break;
        case '5': drawCassette(ctx, cw, ch, dataArray); break;
        case '6': drawParticles(ctx, cw, ch, dataArray, bufferLength); break;
        case '7': drawFloatingOrbs(ctx, cw, ch, dataArray, bufferLength); break;
        case '8': drawTypography(ctx, cw, ch, dataArray); break;
        default: drawSpectrumBars(ctx, cw, ch, dataArray, bufferLength);
    }
}

// Theme 1: Waveform
function drawWaveform(ctx, cw, ch) {
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);
    
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, cw, ch);
    
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00d2ff';
    ctx.beginPath();
    
    const sliceWidth = cw * 1.0 / analyser.frequencyBinCount;
    let x = 0;
    
    for (let i = 0; i < analyser.frequencyBinCount; i++) {
        const v = timeData[i] / 128.0; // 0 to 2
        const y = v * ch / 2;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        x += sliceWidth;
    }
    
    ctx.lineTo(cw, ch / 2);
    ctx.stroke();
    
    // Add glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00d2ff';
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
}

// Theme 2: Spectrum Bars
function drawSpectrumBars(ctx, cw, ch, dataArray, bufferLength) {
    // Clear fully for this one
    ctx.fillStyle = "#0a0a0d";
    ctx.fillRect(0, 0, cw, ch);
    
    const barWidth = (cw / bufferLength) * 2.5; // only take lower frequencies mainly
    let x = 0;
    
    const barsCount = Math.floor(cw / barWidth);
    
    for (let i = 0; i < barsCount; i++) {
        const barHeight = (dataArray[i] / 255) * ch * 0.8;
        
        // Gradient color based on frequency
        const hue = i * 2;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        
        // Draw centered vertically
        ctx.fillRect(x, ch - barHeight, barWidth - 2, barHeight);
        
        x += barWidth;
    }
}

// Theme 3: Circle EQ
function drawCircleEQ(ctx, cw, ch, dataArray, bufferLength) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, cw, ch);

    const centerX = cw / 2;
    const centerY = ch / 2;
    const radius = Math.min(cw, ch) * 0.2;
    
    // Get average bass
    let bassAvg = 0;
    for (let i=0; i<10; i++) bassAvg += dataArray[i];
    bassAvg = bassAvg / 10;
    const pulseOffset = (bassAvg / 255) * 50;

    const barsCount = 120; // number of circumference bars
    const step = (Math.PI * 2) / barsCount;

    for (let i = 0; i < barsCount; i++) {
        // Map i to index in dataArray (mirrored)
        let index = Math.floor((i < barsCount/2 ? i : barsCount - i) * (bufferLength * 0.3 / (barsCount/2)));
        const value = dataArray[index];
        const barHeight = (value / 255) * (Math.min(cw, ch) * 0.3);

        const angle = i * step - Math.PI/2;
        
        const startX = centerX + Math.cos(angle) * (radius + pulseOffset);
        const startY = centerY + Math.sin(angle) * (radius + pulseOffset);
        
        const endX = centerX + Math.cos(angle) * (radius + pulseOffset + barHeight);
        const endY = centerY + Math.sin(angle) * (radius + pulseOffset + barHeight);
        
        ctx.strokeStyle = `hsl(${(i * 360 / barsCount) + (rotationAngle * 10)}, 100%, 50%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    rotationAngle += 0.005;
}

// Theme 4: Vinyl
function drawVinyl(ctx, cw, ch, dataArray) {
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, cw, ch);
    
    const centerX = cw / 2;
    const centerY = ch / 2;
    
    let bassAvg = dataArray[2] + dataArray[3] + dataArray[4];
    const bump = (bassAvg / 765) * 10;
    
    const vinylRadius = Math.min(cw, ch) * 0.38 + bump;
    
    // Draw vinyl base
    ctx.beginPath();
    ctx.arc(centerX, centerY, vinylRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#050505';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#222';
    
    // Draw grooves
    for (let i = 20; i < vinylRadius; i += 8) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, i, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Draw Center label
    ctx.save();
    ctx.translate(centerX, centerY);
    if(isPlaying) rotationAngle += 0.02;
    ctx.rotate(rotationAngle);
    
    ctx.beginPath();
    ctx.arc(0, 0, vinylRadius * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b30'; // Red label
    ctx.fill();
    
    // Center hole
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#121212';
    ctx.fill();
    
    ctx.restore();
}

// Theme 5: Cassette Tape
function drawCassette(ctx, cw, ch, dataArray) {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, cw, ch);
    
    const width = Math.min(cw * 0.8, 600);
    const height = width * 0.63; // standard cassette ratio
    const x = (cw - width) / 2;
    const y = (ch - height) / 2;
    
    // Base shape
    ctx.fillStyle = "#d1d5db"; // light gray body
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 15);
    ctx.fill();
    
    // Sticker
    ctx.fillStyle = "#facc15"; // yellow sticker
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 20, width - 40, height - 100, 10);
    ctx.fill();
    
    // Center window
    const winWidth = width * 0.6;
    const winHeight = height * 0.25;
    const winX = x + (width - winWidth)/2;
    const winY = y + height * 0.4;
    
    ctx.fillStyle = "#111"; // dark glass
    ctx.beginPath();
    ctx.roundRect(winX, winY, winWidth, winHeight, 8);
    ctx.fill();
    
    // Reels
    const reelRadius = winHeight * 0.45;
    const reelDist = winWidth * 0.3;
    const leftReelX = centerX = winX + winWidth/2 - reelDist/2;
    const rightReelX = winX + winWidth/2 + reelDist/2;
    const reelY = winY + winHeight/2;
    
    // Animate reels based on music logic and data
    let speed = isPlaying ? 0.05 + (dataArray[10]/255)*0.1 : 0;
    rotationAngle += speed;
    
    drawReel(ctx, leftReelX, reelY, reelRadius, rotationAngle);
    drawReel(ctx, rightReelX, reelY, reelRadius, rotationAngle);
    
    // Text drawing on cassette
    ctx.fillStyle = "#333";
    ctx.font = "bold 24px 'Outfit'";
    ctx.fillText("MIX TAPE", x + 30, y + 50);
}

function drawReel(ctx, x, y, radius, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    
    // Spokess
    ctx.fillStyle = "#333";
    for(let i=0; i<6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.arc(0, radius*0.6, radius*0.2, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.beginPath();
    ctx.arc(0, 0, radius*0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#333";
    ctx.fill();
    ctx.restore();
}

// Theme 6: Particles
function drawParticles(ctx, cw, ch, dataArray, bufferLength) {
    ctx.fillStyle = "rgba(0,0,10,0.4)";
    ctx.fillRect(0, 0, cw, ch);
    
    let bass = dataArray[5] / 255; // 0 to 1
    
    // Create new particles
    if (bass > 0.6 && particlesArray.length < 200) {
        let count = Math.floor(bass * 5);
        for(let i=0; i<count; i++) {
            particlesArray.push({
                x: cw/2,
                y: ch/2,
                vx: (Math.random() - 0.5) * 15 * bass,
                vy: (Math.random() - 0.5) * 15 * bass,
                size: Math.random() * 5 + 1 + (bass * 5),
                life: 1,
                color: `hsl(${Math.random() * 60 + 200}, 100%, 70%)` // blueish
            });
        }
    }
    
    for (let i = 0; i < particlesArray.length; i++) {
        let p = particlesArray[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02; // decay
        
        if (p.life <= 0) {
            particlesArray.splice(i, 1);
            i--;
            continue;
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// Theme 7: Floating Orbs
function drawFloatingOrbs(ctx, cw, ch, dataArray, bufferLength) {
    ctx.fillStyle = "rgba(10,5,15,0.3)";
    ctx.fillRect(0, 0, cw, ch);
    
    const orbsCount = 10; // Few large orbs
    const bandSize = Math.floor(bufferLength / (orbsCount * 4));
    
    for (let i = 0; i < orbsCount; i++) {
        let sum = 0;
        for (let j = 0; j < bandSize; j++) {
            sum += dataArray[i * bandSize + j];
        }
        let avg = sum / bandSize;
        
        let radius = avg * 0.8;
        if(radius < 10) radius = 10;
        
        // Use a persistent pseudo-random position using index to keep them bounded but floating slightly
        // We'll calculate a generic float effect using Date.now()
        const t = Date.now() * 0.001;
        const xOffset = Math.sin(t + i*2) * 50;
        const yOffset = Math.cos(t * 0.8 + i*3) * 50;
        
        const x = cw * ((i + 1) / (orbsCount + 1)) + xOffset;
        const y = ch / 2 + yOffset;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `hsla(${i * 30 + 100}, 100%, 70%, 0.8)`);
        gradient.addColorStop(1, `hsla(${i * 30 + 100}, 100%, 30%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Glow composite
        ctx.globalCompositeOperation = 'screen';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
}

// Theme 8: Typography
function drawTypography(ctx, cw, ch, dataArray) {
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(0, 0, cw, ch);
    
    // Get average for text scaling
    let midAvg = 0;
    for (let i = 20; i < 40; i++) midAvg += dataArray[i];
    midAvg = midAvg / 20;
    
    const scale = 1 + (midAvg / 255) * 0.3; // Scale 1.0 to 1.3
    
    ctx.save();
    ctx.translate(cw/2, ch/2);
    ctx.scale(scale, scale);
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = "white";
    
    // Draw background ghost layers based on bass
    let bass = dataArray[5];
    if (bass > 200) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        const offset = (bass - 200);
        ctx.font = `italic 900 8rem 'Outfit', sans-serif`;
        ctx.fillText("MUSIC", -offset, -offset);
        ctx.fillText("MUSIC", offset, offset);
    }
    
    ctx.font = `900 8rem 'Outfit', sans-serif`;
    ctx.fillStyle = "white";
    ctx.fillText("MUSIC", 0, 0);
    
    ctx.font = `600 2rem 'Outfit', sans-serif`;
    ctx.fillText(isPlaying ? "NOW PLAYING" : "PAUSED", 0, 100);
    
    ctx.restore();
}

// Boot
window.addEventListener('DOMContentLoaded', init);

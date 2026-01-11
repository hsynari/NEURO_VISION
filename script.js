// Global Error Handler for Vercel/Mobile Debugging
window.onerror = function (msg, url, line) {
    // alert("JS Code Error: " + msg + " (Line: " + line + ")");
    console.error("Global Error:", msg, line);
};

// Global Variables
const canvas = document.getElementById('ascii-canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize
const video = document.createElement('video');
video.setAttribute('playsinline', ''); // Critical for Mobile (iOS)
video.setAttribute('webkit-playsinline', '');
video.muted = true; // Video stream must be muted to autoplay allowed often
const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const videoSelect = document.getElementById('video-source');
const audioSelect = document.getElementById('audio-source');
const scanBtn = document.getElementById('scan-btn');

// Matrix/ASCII config
const density = '@#*+:-. ';
// Character Sets Database { key: sorted_string_by_brightness }
const charSets = {
    japanese: " ・.:-=+*c1tjo7z3sz？！ァィゥェォカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン月火水木金土日",
    ascii: " .'`^,:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    binary: " 010101011100011", // Simple binary
    blocks: " ░▒▓█", // Simple blocks
    runes: " ᚛᚜ᚐᚑᚒᚓᚔᚕᚖᚗᚘᚙᚚᚠᚡᚢᚣᚤᚥᚦᚧᚨᚩᚪᚫᚬᚭᚮᚯ",
    math: " .-={}+<>&*$#@∑∫≈∞", // Math-like
    braille: " ⠀⠄⠆⠖⠶⡶⣩⣪⣫⣾⣿",
    dots: " 　.·,:;°^~•*oO0@●◎⦿"
};
// charSize is now handled dynamically in render()

// Audio context
let audioContext;
let analyser;
let microphone;
let dataArray;

let isActive = false;

// Device Enumeration
async function getDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();

        // Clear existing
        videoSelect.innerHTML = '';
        audioSelect.innerHTML = '';

        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.text = "No Camera Found";
            videoSelect.appendChild(option);
        } else {
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${videoSelect.length + 1}`;
                videoSelect.appendChild(option);
            });
        }

        if (audioDevices.length === 0) {
            const option = document.createElement('option');
            option.text = "No Audio Input";
            audioSelect.appendChild(option);
        } else {
            audioDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioSelect.length + 1}`;
                audioSelect.appendChild(option);
            });
        }
    } catch (err) {
        console.error("Error enumerating devices:", err);
    }
}

// Initial populate attempt (might lack labels without permission)
getDevices();

const systemLog = document.getElementById('system-log');

function log(msg, isError = false) {
    systemLog.style.display = 'block';
    const line = document.createElement('div');
    line.innerText = `> ${msg}`;
    if (isError) line.style.color = '#f55';
    systemLog.appendChild(line);
    systemLog.scrollTop = systemLog.scrollHeight;
    console.log(msg);
}

scanBtn.addEventListener('click', async () => {
    if (scanBtn.disabled) return;

    // UI Feedback
    scanBtn.disabled = true;
    scanBtn.style.opacity = "0.5";
    scanBtn.innerText = "[ SCANNING... ]";
    log("-------------------------");
    log("Requesting permissions...");

    try {
        // Try audio+video first
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
            log(`Audio+Video check failed (${e.name})...`);
            try {
                // Fallback: Video only
                log("Trying Video only...");
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (inner) {
                // If this fails too, throw to outer catch
                throw inner;
            }
        }

        // If we got here, we have some permission
        if (stream) {
            // Stop this stream immediately, we just needed perms
            stream.getTracks().forEach(track => track.stop());
        }

        // Now enumerate with labels
        await getDevices();

        scanBtn.innerText = "[ DEVICES FOUND ]";
        scanBtn.style.color = "#0f0";
        scanBtn.style.borderColor = "#0f0";
        scanBtn.style.opacity = "1";
        scanBtn.disabled = false;

        log("SUCCESS: Devices found.");
        log("ACTION: Select Camera above and click INITIALIZE.");

    } catch (err) {
        console.error("Permission error:", err);
        log(`ACCESS DENIED: ${err.name}`, true);
        log(`Info: ${err.message}`, true);

        if (err.name === 'NotAllowedError') {
            log("HINT: Click lock icon in URL bar -> Allow Camera.", true);
        } else if (err.name === 'NotFoundError') {
            log("HINT: No camera hardware found!", true);
        } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
            log("HINT: Camera is busy! Close Zoom/Discord/Teams.", true);
            log("HINT: Or unplug/replug the camera.", true);
        }

        // Reset button to allow retry
        scanBtn.innerText = "[ RETRY SCAN ]";
        scanBtn.style.opacity = "1";
        scanBtn.disabled = false;
    }
});

const tabAudioBtn = document.getElementById('tab-audio-btn');
if (tabAudioBtn) {
    tabAudioBtn.addEventListener('click', async () => {
        try {
            // Request System/Tab Audio (Video required for prompt)
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (!analyser) analyser = audioContext.createAnalyser();

                // Create Source
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                source.connect(audioContext.destination); // Loopback to hear it

                // Visual Signal
                tabAudioBtn.style.background = '#0f0';
                tabAudioBtn.style.color = '#000';
                tabAudioBtn.innerText = '[ AUDIO LOCKED ]';

                // Stop unused video track to save resources
                stream.getVideoTracks().forEach(track => track.stop());
            } else {
                alert("No Audio Track! Please ensure 'Share Audio' is checked in the popup.");
                stream.getTracks().forEach(t => t.stop());
            }
        } catch (err) {
            console.warn("Tab Audio cancelled/failed", err);
        }
    });
}

startBtn.addEventListener('click', async () => {
    try {
        bgActive = false; // Stop background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height); // Clear

        await initCamera();
        await initAudio();
        startScreen.style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex'; // Show persistent UI (Flex)
        video.play();
        isActive = true;
        render();
    } catch (err) {
        console.error("Initialization failed", err);
        alert("Camera or Microphone access denied. Please allow permissions.");
    }
});

const videoUpload = document.getElementById('video-upload');
let isVideoFileMode = false;

if (videoUpload) {
    videoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            isVideoFileMode = true;
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(t => t.stop());
                video.srcObject = null;
            }
            video.src = URL.createObjectURL(file);
            video.loop = true;
            video.muted = false;
            document.getElementById('video-file-name').innerText = `SELECTED: ${file.name}`;
            document.getElementById('video-upload-btn').style.background = '#030';
        }
    });
}

async function initCamera() {
    // If Video File Mode is Active, skip Webcam
    if (isVideoFileMode) {
        try {
            await video.play();
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!analyser) analyser = audioContext.createAnalyser();

            if (!video._source) {
                const source = audioContext.createMediaElementSource(video);
                source.connect(analyser);
                source.connect(audioContext.destination);
                video._source = source;
            }
            return;
        } catch (e) {
            console.error("Video file play failed", e);
        }
    }

    // Read Resolution
    const resSelect = document.getElementById('live-resolution-select');
    let width = 960;
    let height = 540;

    if (resSelect && resSelect.value) {
        const parts = resSelect.value.split('x');
        if (parts.length === 2) {
            width = parseInt(parts[0]);
            height = parseInt(parts[1]);
        }
    }

    const videoSource = videoSelect.value;

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            width: { ideal: width },
            height: { ideal: height },
            deviceId: videoSource ? { exact: videoSource } : undefined
        },
        audio: false
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Auto-Detect Mirroring Logic
                const track = stream.getVideoTracks()[0];
                if (track && track.getSettings) {
                    const settings = track.getSettings();
                    // If Back Camera, disable mirror
                    if (settings.facingMode === 'environment') {
                        isMirrored = false;
                    } else {
                        isMirrored = true;
                    }
                }
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                video.play();
                resolve();
            };
        });
    } catch (err) {
        console.warn("Res switch error:", err);
    }
}

// Resolution Switch Listener
// Resolution Switch Listener
document.getElementById('live-resolution-select')?.addEventListener('change', () => {
    if (isActive) {
        initCamera();
    }
});

// Size Slider Listener (Display Value)
const sizeSlider = document.getElementById('live-size-control');
const sizeLabel = document.getElementById('size-val');
if (sizeSlider && sizeLabel) {
    sizeSlider.addEventListener('input', (e) => {
        sizeLabel.innerText = `${e.target.value}px`;
    });
}

// Listener for Music Upload (Unified)
const musicUpload = document.getElementById('music-upload');
const audioPlayer = document.getElementById('audio-player');
const uploadBtn = document.getElementById('upload-btn'); // Added reference

if (musicUpload && audioPlayer) {
    musicUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            audioPlayer.src = URL.createObjectURL(file);
            audioPlayer.style.display = 'block';
            audioPlayer.loop = true; // Force Repeat

            if (uploadBtn) uploadBtn.innerText = `[ TRACK: ${file.name.substring(0, 12)}... ]`;

            // If already active, try to play/connect
            if (isActive) {
                audioPlayer.play().catch(e => console.log("Play waiting for gesture"));
                if (!audioPlayer._connected && audioContext) {
                    try {
                        const source = audioContext.createMediaElementSource(audioPlayer);
                        source.connect(analyser);
                        source.connect(audioContext.destination);
                        audioPlayer._connected = true;
                    } catch (err) { console.log(err); }
                }
            }
        }
    });
}

function connectMusicToAnalyser() {
    if (audioPlayer && !audioPlayer._connected && audioContext) {
        try {
            // Check if source already exists? createMediaElementSource can be created only once per element usually
            // But we track _connected flag.
            const source = audioContext.createMediaElementSource(audioPlayer);
            source.connect(analyser);
            source.connect(audioContext.destination);
            audioPlayer._connected = true;
        } catch (e) {
            console.log("Audio connection check: ", e);
        }
    }
}

async function initAudio() {
    try {
        const audioSource = audioSelect.value;
        const constraints = {
            audio: {
                deviceId: audioSource ? { exact: audioSource } : undefined
            }
        };

        let usingMic = false;
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia(constraints);
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(audioStream);
            microphone.connect(analyser);
            usingMic = true;
        } catch (err) {
            log("Mic init failed, but checking for music fallback...");
        }

        // 2. Initialize Music Connection
        // If original failed (no mic), we might still need a context for music
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
        }

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        if (!usingMic) {
            log("Fallback: AudioContext created for Music (Mic failed/skipped).");
        }

        connectMusicToAnalyser();

        // Auto-play if file loaded
        if (audioPlayer.src) {
            audioPlayer.play().catch(e => log("Auto-play blocked, press Play on player."));
        }
    } catch (e) {
        console.warn("Audio init failed or rejected", e);
    }
}

// Offscreen canvas for downsampling
const smallCanvas = document.createElement('canvas');
const smallCtx = smallCanvas.getContext('2d');

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

function getAverageVolume() {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(dataArray);
    let values = 0;
    const length = dataArray.length;
    for (let i = 0; i < length; i++) {
        values += dataArray[i];
    }
    return values / length;
}

function getBassEnergy() {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(dataArray);
    // Low frequencies (Bass) are at the start (approx 0-200Hz)
    let bValues = 0;
    for (let i = 0; i < 5; i++) {
        bValues += dataArray[i];
    }
    return bValues / 5;
}

function render() {
    if (!isActive) return;

    // Read Brightness Slider
    const brtSlider = document.getElementById('live-brightness-control');
    const brightnessBoost = brtSlider ? parseInt(brtSlider.value) : 0;


    // Read Controls
    const sizeInput = document.getElementById('live-size-control');
    const colorInput = document.getElementById('live-color-control');
    const charSize = sizeInput ? parseInt(sizeInput.value) : 12; // Fallback to 12
    const colorMode = colorInput ? colorInput.value : 'dynamic';

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate grid dimensions
    // Prevent divide by zero
    const safeCharSize = charSize > 0 ? charSize : 12;
    const w = Math.ceil(canvas.width / safeCharSize);
    const h = Math.ceil(canvas.height / safeCharSize);

    // Resize small canvas to grid size
    if (smallCanvas.width !== w || smallCanvas.height !== h) {
        smallCanvas.width = w;
        smallCanvas.height = h;
    }

    // Draw video frame to small canvas
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        smallCtx.save();
        if (typeof isMirrored === 'undefined' ? true : isMirrored) {
            smallCtx.translate(w, 0);
            smallCtx.scale(-1, 1);
        }
        smallCtx.drawImage(video, 0, 0, w, h);
        smallCtx.restore();
    }

    // Get pixel data
    const imageData = smallCtx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    // Select styling based on dropdown (Dynamic Lookup)
    const currentSelect = document.getElementById('live-style-select');
    const selectedStyle = currentSelect ? currentSelect.value : 'japanese';
    const chars = charSets[selectedStyle] || charSets['japanese'];

    // Audio Analysis
    const vol = getAverageVolume();
    const bass = getBassEnergy();
    const volNorm = vol / 255;
    const bassNorm = bass / 255;

    // Dynamic styles
    const dynamicSize = safeCharSize + (volNorm * (safeCharSize * 0.3));

    ctx.font = `${Math.floor(dynamicSize)}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // COLOR PALETTE LOGIC
    let baseHue = 120; // Default Green
    let isRainbow = false;

    // Determine Base Parameters based on Mode
    switch (colorMode) {
        case 'matrix': baseHue = 120; break;
        case 'cyber': baseHue = 190; break; // Cyan/Blue
        case 'fire': baseHue = 0; break; // Red
        case 'bw': baseHue = 0; break; // Saturation will be 0
        case 'rainbow': isRainbow = true; break;
        case 'dynamic':
        default:
            baseHue = 120 + (volNorm * 200);
            break;
    }

    // Loop through pixels
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        const brightness = Math.min(255, ((r + g + b) / 3) * 1.3);

        if (brightness < 20) continue;

        let charIndex = Math.floor((brightness / 255) * (chars.length - 1));
        let finalChar = chars[charIndex];

        // SPECIAL MODES
        if (colorMode === 'fade_up_down') {
            // Flowing Matrix Code (Downwards)
            // Use Y pos (from index) for smoother flow
            const yPos = Math.floor(i / 4 / w);
            const flow = Math.floor(performance.now() / 30 - (yPos / 2));
            charIndex = (charIndex + Math.abs(flow)) % chars.length;
            finalChar = chars[charIndex];
        } else {
            // Standard Bass Jitter
            const jitterIntensity = 2 + Math.floor(bassNorm * 20);
            const jitter = Math.floor(Math.random() * (jitterIntensity * 2 + 1)) - jitterIntensity;
            charIndex += jitter;
            charIndex = Math.max(0, Math.min(charIndex, chars.length - 1));
            finalChar = chars[charIndex];
        }

        const pixelIndex = i / 4;
        const x = (pixelIndex % w) * charSize + (charSize / 2);
        const y = Math.floor(pixelIndex / w) * charSize + (charSize / 2);

        // COLOR LOGIC
        let pixelHue = baseHue;
        let pixelSat = 100;
        let pixelLight = Math.min(90, (brightness / 255 * 50) + (volNorm * 40));

        // Manual Brightness Boost
        pixelLight += brightnessBoost;
        pixelLight = Math.max(0, Math.min(100, pixelLight));

        if (colorMode === 'dynamic' || colorMode === 'fade_up_down') {
            // Dynamic: Green/Blue base, Red on Bass
            let targetHue = 180 + (volNorm * 50);
            if (bassNorm > 0.45) {
                const bassIntensity = (bassNorm - 0.45) / 0.55;
                targetHue = 60 - (bassIntensity * 60);
            }
            pixelHue = targetHue;

            // Extra pop for flow mode
            if (colorMode === 'fade_up_down') pixelSat = 90;
        } else if (colorMode === 'bw') {
            pixelSat = 0;
        } else if (isRainbow) {
            pixelHue = (x / canvas.width * 360) + (performance.now() / 10);
        }


        ctx.fillStyle = `hsl(${pixelHue % 360}, ${pixelSat}%, ${pixelLight}%)`;
        ctx.fillText(finalChar, x, y);
    }

    requestAnimationFrame(render);
}

// ----------------------
// MATRIX RAIN BACKGROUND (Start Screen)
// ----------------------
let bgActive = true;
const bgFontSize = 16;
let drops = [];

function initMatrixRain() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const columns = Math.ceil(canvas.width / bgFontSize);
    drops = Array(columns).fill(1).map(() => Math.random() * -50); // Random start Y
    drawMatrixBackground();
}

function drawMatrixBackground() {
    if (!bgActive) return;

    // Fade effect logic
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F0'; // Matrix Green
    ctx.font = `${bgFontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
        // Random Char
        const text = String.fromCharCode(0x30A0 + Math.random() * 96);
        const x = i * bgFontSize;
        const y = drops[i] * bgFontSize;

        ctx.fillText(text, x, y);

        // Reset drop to top randomly
        if (y > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
    requestAnimationFrame(drawMatrixBackground);
}

// Start Initial Background on Load
initMatrixRain();

// Handle resize for background too
window.addEventListener('resize', () => {
    if (!isActive) {
        // Debounce or just re-init
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Re-calc columns
        const columns = Math.ceil(canvas.width / bgFontSize);
        // Only extend drops if needed, or reset? Reset is safer visually
        drops = Array(columns).fill(1).map(() => Math.random() * -50);
    }
});

// Snapshot Logic
document.getElementById('snapshot-btn')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `neuro_vision_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
});


// Start Matrix Rain on Load
initMatrixRain();

// Dynamic Resolution Based on Device
function updateResolutionOptions() {
    // Robust Mobile Detection
    const ua = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
    const isSmallScreen = window.innerWidth <= 800;

    const isMobile = isMobileUA || isSmallScreen;

    console.log("Device Detection:", { isMobile, isMobileUA, width: window.innerWidth });

    const select = document.getElementById('live-resolution-select');
    if (!select) return;

    select.innerHTML = ''; // Clear default

    let opts = [];
    if (isMobile) {
        opts = [
            { t: 'Mobile HD (Vert)', v: '720x1280', s: true }, // Default for Mobile
            { t: 'Mobile SD (Vert)', v: '480x640' },
            { t: 'Square (1:1)', v: '600x600' },
            { t: 'Landscape HD', v: '1280x720' },
            { t: 'Landscape Full', v: '1920x1080' }
        ];
    } else {
        opts = [
            { t: '1080p Full HD', v: '1920x1080' },
            { t: '720p HD', v: '1280x720', s: true },
            { t: '540p qHD', v: '960x540' },
            { t: '480p SD', v: '854x480' }
        ];
    }

    opts.forEach(o => {
        const el = document.createElement('option');
        el.value = o.v;
        el.innerText = o.t;
        if (o.s) el.selected = true;
        select.appendChild(el);
    });
}
updateResolutionOptions();

window.addEventListener('resize', () => {
    if (bgActive) initMatrixRain();
    else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

// Mirror Toggle Logic
let isMirrored = true;
document.getElementById('mirror-btn')?.addEventListener('click', (e) => {
    isMirrored = !isMirrored;
    // Visual feedback handled by render loop, but maybe flash button?
    e.target.style.color = isMirrored ? '#0f0' : '#888';
});

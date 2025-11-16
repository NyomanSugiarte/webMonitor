const x_data = () => {
    return {
        currentScreen: 'menu',
        currentMode: 'monitoring',
        // login state
        loginUsername: '',
        loginPassword: '',
        correctUsername: 'krakatau',
        correctPassword: 'andover',

        ipAddress: "http://192.168.1.100:5001",
        port: "/dev/pixhawk",
        baudrate: "9600",
        realtimeData: true,
        currentDate: moment().format("YYYY-MM-DD"),
        currentTime: moment().format("HH:mm"),

        surfaceCamera: {
            streamUrl: "",
            waypointsText: "",
            waypoints: [],
            image: "",
            refreshImage: 0,
            refreshStream: 0,
        },

        underwaterCamera: {
            streamUrl: "",
            waypointsText: "",
            waypoints: [],
            image: "",
            refreshImage: 0,
            refreshStream: 0,
        },

        vehicleData: {
            app_connect: false,
            alt: 0,
            battery: 0,
            date: "",
            is_armable: false,
            last_heartbeat: "",
            lat: 0,
            long: 0,
            mode: "",
            pitch: 0,
            roll: 0,
            surface_camera_connect: true,
            system_status: "",
            time: "",
            underwater_camera_connect: false,
            yaw: 0,
            current_wp: 0,
        },

        // GPS Tracker properties
        gpsTracker: {
            canvas: null,
            ctx: null,
            ctxPattern: null,
            canvasPattern: null,
            watchId: null,
            originGPS: null,
            path: [],
            totalDistance: 0,
            startTime: null,
            lastUpdateTime: null,
            pixelsPerMeter: 3,
            CANVAS_SIZE: 600,
            MARGIN: 40,
            EARTH_RADIUS: 6371000,
            isTracking: false,
            wakeLock: null,
            retryCount: 0,
        },

        async init() {
            // Inisialisasi GPS Tracker Canvas
            this.initGPSCanvas();

            // Jalankan loop update setiap 2 detik
            setInterval(async () => {
                try {
                    if (this.realtimeData) {
                        const response = await axios.get(`${this.ipAddress}/context`);
                        this.vehicleData = response.data.data;

                        // === Sinkronisasi status kamera dengan context server ===
                        if (this.vehicleData.surface_camera_connect) {
                            this.surfaceCamera.streamUrl = `${this.ipAddress}/camera/surface-stream`;
                        } else {
                            this.surfaceCamera.streamUrl = "";
                        }

                        if (this.vehicleData.underwater_camera_connect) {
                            this.underwaterCamera.streamUrl = `${this.ipAddress}/camera/underwater-stream`;
                        } else {
                            this.underwaterCamera.streamUrl = "";
                        }
                        const timestamp = new Date().getTime();
                        this.surfaceCamera.image = `${this.ipAddress}/camera/surface-latest?ts=${timestamp}`;
                        this.underwaterCamera.image = `${this.ipAddress}/camera/underwater-latest?ts=${timestamp}`;

                        // Update otomatis waypoint capture dan GPS
                        this.waypointCaptureSurfaceAuto();
                        this.waypointCaptureUnderwaterAuto();
                        this.updateGPSFromVehicle();
                    }
                } catch (err) {
                    console.warn("Gagal ambil data context:", err.message);
                }
            }, 2000);

            // Update jam dan tanggal
            setInterval(() => {
                this.currentDate = moment().format("YYYY-MM-DD");
                this.currentTime = moment().format("HH:mm:ss");
            }, 1000);

            // toastr config
            toastr.options = {
                "closeButton": true,
                "progressBar": true,
                "positionClass": "toast-top-right",
                "timeOut": "5000",
            }

            // Request wake lock untuk GPS tracking
            this.requestWakeLock();
        },

        // ========== EXISTING METHODS ==========
        async selectMonitoring() {
            this.currentMode = 'monitoring';
            this.currentScreen = 'dashboard';
            toastr.info('Monitoring mode activated');
        },

        async showLogin() {
            this.currentScreen = 'login';
            this.loginUsername = '';
            this.loginPassword = '';
        },

        async login() {
            if (this.loginUsername === this.correctUsername && this.loginPassword === this.correctPassword) {
                this.currentMode = 'control';
                this.currentScreen = 'dashboard';
                toastr.success('Login successful! Control mode activated');
            } else {
                toastr.error('Invalid username or password!');
            }
        },

        async logout() {
            this.currentScreen = 'menu';
            this.currentMode = 'monitoring';
            this.loginUsername = '';
            this.loginPassword = '';
            toastr.info('Logged out successfully');
        },

        async backToMenu() {
            this.currentScreen = 'menu';
        },

        async connectGcs() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    app_connect: true,
                    port: this.port,
                    baudrate: this.baudrate
                });
                toastr.success("GCS connected successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to connect GCS", "Error");
            }
        },

        async disconnectGcs() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    app_connect: false,
                });
                toastr.success("GCS disconnected successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to disconnect GCS", "Error");
            }
        },

        async saveSurfaceWaypoints() {
            if (this.surfaceCamera.waypointsText === "") {
                toastr.error("Waypoints for surface camera cannot be empty", "Error");
                return;
            }
            try {
                this.surfaceCamera.waypoints = this.surfaceCamera.waypointsText.split(" ");
                const response = await axios.post(`${this.ipAddress}/context`, {
                    surface_camera_waypoints: this.surfaceCamera.waypoints,
                });
                toastr.success("Waypoints for surface camera saved successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to save waypoints for surface camera", "Error");
            }
        },

        async startSurfaceCamera() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    surface_camera_connect: true,
                });
                this.surfaceCamera.refreshStream += 1;
                this.surfaceCamera.streamUrl = `${this.ipAddress}/camera/surface-stream?refresh=${this.surfaceCamera.refreshStream}`;
                toastr.success("Surface camera started successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to start surface camera", "Error");
            }
        },

        async stopSurfaceCamera() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    surface_camera_connect: false,
                });
                this.surfaceCamera.streamUrl = "";
                toastr.success("Surface camera stopped successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to stop surface camera", "Error");
            }
        },

        async captureSurfaceImage() {
            try {
                const response = await axios.get(`${this.ipAddress}/camera/surface-capture`);
                this.surfaceCamera.refreshImage += 1;
                this.surfaceCamera.image = `${this.ipAddress}/camera/surface-latest?refresh=${this.surfaceCamera.refreshImage}`;
                toastr.success("Image for surface camera captured successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to capture surface image", "Error");
            }
        },

        async startUnderwaterCamera() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    underwater_camera_connect: true,
                });
                this.underwaterCamera.refreshStream += 1;
                this.underwaterCamera.streamUrl = `${this.ipAddress}/camera/underwater-stream?refresh=${this.underwaterCamera.refreshStream}`;
                toastr.success("Underwater camera started successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to start underwater camera", "Error");
            }
        },

        async stopUnderwaterCamera() {
            try {
                const response = await axios.post(`${this.ipAddress}/context`, {
                    underwater_camera_connect: false,
                });
                this.underwaterCamera.streamUrl = "";
                toastr.success("Underwater camera stopped successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to stop underwater camera", "Error");
            }
        },

        async saveUnderwaterWaypoints() {
            if (this.underwaterCamera.waypointsText === "") {
                toastr.error("Waypoints for underwater camera cannot be empty", "Error");
                return;
            }
            try {
                this.underwaterCamera.waypoints = this.underwaterCamera.waypointsText.split(" ");
                const response = await axios.post(`${this.ipAddress}/context`, {
                    underwater_camera_waypoints: this.underwaterCamera.waypoints,
                });
                toastr.success("Waypoints for underwater camera saved successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to save waypoints for underwater camera", "Error");
            }
        },

        async captureUnderwaterImage() {
            try {
                const response = await axios.get(`${this.ipAddress}/camera/underwater-capture`);
                this.underwaterCamera.refreshImage += 1;
                this.underwaterCamera.image = `${this.ipAddress}/camera/underwater-latest?refresh=${this.underwaterCamera.refreshImage}`;
                toastr.success("Image for underwater camera captured successfully!", "Success");
            } catch (error) {
                toastr.error("Failed to capture underwater image", "Error");
            }
        },

        async waypointCaptureSurfaceAuto() {
            try {
                const currentWP = this.vehicleData.current_wp;
                const waypoints = this.surfaceCamera.waypoints;

                if (!waypoints || waypoints.length === 0) return;

                if (waypoints.includes(String(currentWP))) {
                    console.log(`📸 Waypoint ${currentWP} matched – taking surface photo`);
                    await this.captureSurfaceImage();

                    this.surfaceCamera.waypoints = this.surfaceCamera.waypoints.filter(wp => wp !== String(currentWP));
                    this.surfaceCamera.waypointsText = this.surfaceCamera.waypoints.join(" ");
                    toastr.success(`Auto-captured image for surface waypoint ${currentWP}!`);
                }
            } catch (error) {
                console.error(error);
                toastr.error("Failed to auto-capture surface image", "Error");
            }
        },

        async waypointCaptureUnderwaterAuto() {
            try {
                const currentWP = this.vehicleData.current_wp;
                const waypoints = this.underwaterCamera.waypoints;

                if (!waypoints || waypoints.length === 0) return;

                if (waypoints.includes(String(currentWP))) {
                    console.log(`📸 Waypoint ${currentWP} matched – taking underwater photo`);
                    await this.captureUnderwaterImage();

                    this.underwaterCamera.waypoints = this.underwaterCamera.waypoints.filter(wp => wp !== String(currentWP));
                    this.underwaterCamera.waypointsText = this.underwaterCamera.waypoints.join(" ");
                    toastr.success(`Auto-captured image for underwater waypoint ${currentWP}!`);
                }
            } catch (error) {
                console.error(error);
                toastr.error("Failed to auto-capture underwater image", "Error");
            }
        },

        // ===================== GPS Tracker =====================
        initGPSCanvas() {
            const canvas = document.getElementById('gpsCanvas');
            if (!canvas) {
                console.log('Canvas not found, retrying...');
                setTimeout(() => this.initGPSCanvas(), 500);
                return;
            }

            this.gpsTracker.canvas = canvas;
            this.gpsTracker.ctx = canvas.getContext('2d');

            // Responsive canvas sizing
            const container = canvas.parentElement;
            const containerWidth = container.clientWidth;
            const size = Math.min(containerWidth, 300);

            canvas.width = size;
            canvas.height = size;
            canvas.style.width = '100%';
            canvas.style.height = 'auto';

            this.drawGPSCanvas();
            console.log('GPS Tracker initialized - Canvas size:', size);

            // Redraw on window resize
            window.addEventListener('resize', () => {
                const newSize = Math.min(container.clientWidth, 600);
                const canvas = this.gpsTracker.canvas;
                if (Math.abs(canvas.width - newSize) > 50) {
                    canvas.width = newSize;
                    canvas.height = newSize;
                    this.drawGPSCanvas();
                }
            });
        },

        gpsToLocalXY(lat, lon) {
            if (!this.gpsTracker.originGPS) return { x: 0, y: 0 };

            const dLat = lat - this.gpsTracker.originGPS.lat;
            const dLon = lon - this.gpsTracker.originGPS.lon;
            const x = dLon * (Math.PI / 180) * this.gpsTracker.EARTH_RADIUS * Math.cos(this.gpsTracker.originGPS.lat * Math.PI / 180);
            const y = dLat * (Math.PI / 180) * this.gpsTracker.EARTH_RADIUS;

            return { x, y };
        },

        xyToCanvas(x, y) {
            const canvasX = this.gpsTracker.MARGIN + (x * this.gpsTracker.pixelsPerMeter);
            const canvasY = this.gpsTracker.canvas.height - this.gpsTracker.MARGIN - (y * this.gpsTracker.pixelsPerMeter);
            return { canvasX, canvasY };
        },

        getGridSpacing() {
            const viewRange = (this.gpsTracker.canvas.width - this.gpsTracker.MARGIN * 2) / this.gpsTracker.pixelsPerMeter;
            if (viewRange > 500) return 100;
            if (viewRange > 200) return 50;
            if (viewRange > 100) return 20;
            if (viewRange > 50) return 10;
            if (viewRange > 20) return 5;
            if (viewRange > 10) return 2;
            return 1;
        },

        drawExamplePattern() {
            const ctx = this.gpsTracker.ctx;
            const canvas = this.gpsTracker.canvas;

            const w = canvas.width;
            const h = canvas.height;

            // Ukuran elemen proporsional
            const dotRadius = w * 0.008;
            const boxWidth = w * 0.08;
            const boxHeight = h * 0.035;
            const boxBlueWidth = w * 0.06;
            const boxBlueHeight = h * 0.025;

            // Posisi vertikal relatif
            const topYGreen = h * 0.12;
            const topYRed = h * 0.23;
            const sideTopY = h * 0.35;
            const sideGap = h * 0.07;
            const bottomY = h * 0.78;

            // Warna dengan opacity
            const green = "#00cc6680";
            const red = "#ff333380";
            const blue = "#0066cc80";

            // ===== Titik di bagian atas =====
            const numTopDots = 4;
            const topStartX = w * 0.28;
            const topEndX = w * 0.68;
            const topGapX = (topEndX - topStartX) / (numTopDots - 1);

            for (let i = 0; i < numTopDots; i++) {
                const x = topStartX + i * topGapX;

                // Titik hijau
                ctx.beginPath();
                ctx.arc(x, topYGreen, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = green;
                ctx.fill();

                // Titik merah di bawahnya
                ctx.beginPath();
                ctx.arc(x, topYRed, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = red;
                ctx.fill();
            }

            // ===== Titik di sisi kiri =====
            for (let i = 0; i < 3; i++) {
                const y = sideTopY + i * sideGap;
                const x1 = w * 0.1;
                const x2 = w * 0.20;

                // Hijau
                ctx.beginPath();
                ctx.arc(x1, y, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = green;
                ctx.fill();

                // Merah
                ctx.beginPath();
                ctx.arc(x2, y + sideGap * 0.4, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = red;
                ctx.fill();
            }

            // ===== Titik di sisi kanan =====
            for (let i = 0; i < 3; i++) {
                const y = sideTopY + i * sideGap;
                const x1 = w * 0.80;
                const x2 = w * 0.90;

                // Hijau
                ctx.beginPath();
                ctx.arc(x1, y, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = green;
                ctx.fill();

                // Merah
                ctx.beginPath();
                ctx.arc(x2, y + sideGap * 0.4, dotRadius, 0, 2 * Math.PI);
                ctx.fillStyle = red;
                ctx.fill();
            }

            // ===== Kotak hijau dan biru di bawah =====
            ctx.fillStyle = green;
            ctx.fillRect(w * 0.18, bottomY, boxWidth, boxHeight);
            ctx.fillRect(w * 0.7, bottomY - h * 0.08, boxWidth, boxHeight);

            ctx.fillStyle = blue;
            ctx.fillRect(w * 0.48, bottomY + h * 0.06, boxBlueWidth, boxBlueHeight);
        },

        drawGPSCanvas() {
            if (!this.gpsTracker.ctx) return;
            const ctx = this.gpsTracker.ctx;
            const canvas = this.gpsTracker.canvas;
            
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw pattern PERTAMA (background)
            this.drawExamplePattern();
            
            // Draw axes dan grid
            this.drawAxes();
            this.drawOrigin();
            
            // Draw trajectory PATH
            if (this.gpsTracker.path.length > 0) {
                this.drawPath();
            }
            
            // Update scale info
            this.updateScaleInfo();
        },

        drawGrid() {
            const ctx = this.gpsTracker.ctx;
            const canvas = this.gpsTracker.canvas;
            const gridSpacing = this.getGridSpacing();

            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.font = '9px Arial, sans-serif';
            ctx.fillStyle = '#444';

            const maxXY = (canvas.width - this.gpsTracker.MARGIN * 2) / this.gpsTracker.pixelsPerMeter;

            for (let x = 0; x <= maxXY; x += gridSpacing) {
                const coords = this.xyToCanvas(x, 0);
                ctx.beginPath();
                ctx.moveTo(coords.canvasX, this.gpsTracker.MARGIN);
                ctx.lineTo(coords.canvasX, canvas.height - this.gpsTracker.MARGIN);
                ctx.stroke();
                ctx.fillText(`${x}`, coords.canvasX - 8, canvas.height - this.gpsTracker.MARGIN + 12);
            }

            for (let y = 0; y <= maxXY; y += gridSpacing) {
                const coords = this.xyToCanvas(0, y);
                ctx.beginPath();
                ctx.moveTo(this.gpsTracker.MARGIN, coords.canvasY);
                ctx.lineTo(canvas.width - this.gpsTracker.MARGIN, coords.canvasY);
                ctx.stroke();
                ctx.fillText(`${y}`, 5, coords.canvasY + 3);
            }
        },

        drawAxes() {
            const ctx = this.gpsTracker.ctx;
            const canvas = this.gpsTracker.canvas;
            ctx.strokeStyle = '#0084ffff';
            ctx.lineWidth = 2;
        },

        drawOrigin() {
            const ctx = this.gpsTracker.ctx;
            const origin = this.xyToCanvas(0, 0);
            ctx.beginPath();
            ctx.arc(origin.canvasX, origin.canvasY, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff0000ff';
            ctx.fill();
            ctx.strokeStyle = '#000000ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        },

        drawPath() {
            const ctx = this.gpsTracker.ctx;
            const path = this.gpsTracker.path.map(p => ({ ...p, ...this.xyToCanvas(p.x, p.y) }));

            // Draw trajectory line
            ctx.beginPath();
            path.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.canvasX, p.canvasY);
                else ctx.lineTo(p.canvasX, p.canvasY);
            });
            ctx.strokeStyle = '#00aaff';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Draw path points
            path.forEach((p, i) => {
                const isLast = i === path.length - 1;
                ctx.beginPath();
                ctx.arc(p.canvasX, p.canvasY, isLast ? 7 : 3, 0, 2 * Math.PI);
                ctx.fillStyle = isLast ? '#ff0000' : '#00e1ffff';
                ctx.fill();
                
                if (isLast) {
                    ctx.strokeStyle = '#000000ff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Label koordinat terakhir
                    ctx.fillStyle = '#ff0000';
                    ctx.font = 'bold 10px Arial, sans-serif';
                    ctx.fillText(`(${p.x.toFixed(1)},${p.y.toFixed(1)})`, p.canvasX + 10, p.canvasY - 8);
                    
                    // Draw arrow
                    if (path.length > 1) {
                        const prev = path[path.length - 2];
                        const angle = Math.atan2(p.canvasY - prev.canvasY, p.canvasX - prev.canvasX);
                        ctx.save();
                        ctx.translate(p.canvasX, p.canvasY);
                        ctx.rotate(angle);
                        ctx.beginPath();
                        ctx.moveTo(15, 0);
                        ctx.lineTo(10, -5);
                        ctx.lineTo(10, 5);
                        ctx.closePath();
                        ctx.fill();
                        ctx.restore();
                    }
                }
            });
        },

        updateGPSFromVehicle() {
            const lat = this.vehicleData.lat;
            const lon = this.vehicleData.long;

            // Skip jika data GPS tidak valid atau tracking tidak aktif
            if (!this.gpsTracker.isTracking) return;
            if (!lat || !lon || lat === 0 || lon === 0) return;

            this.updateGPSPosition();
        },

        updateGPSPosition() {
            const lat = this.vehicleData.lat;
            const lon = this.vehicleData.long;
            if (!lat || !lon || lat === 0 || lon === 0) return;

            const timestamp = Date.now();

            if (!this.gpsTracker.originGPS) {
                this.gpsTracker.originGPS = { lat, lon };
                this.gpsTracker.startTime = timestamp;
                toastr.success('Origin GPS ditetapkan dari vehicleData!');
            }

            if (this.gpsTracker.path.length > 0) {
                const last = this.gpsTracker.path[this.gpsTracker.path.length - 1];
                const dist = this.calculateDistance(last.lat, last.lon, lat, lon);
                if (dist < 0.5) return; // abaikan pergerakan kecil
                this.gpsTracker.totalDistance += dist;
            }

            const xy = this.gpsToLocalXY(lat, lon);
            this.gpsTracker.path.push({
                x: xy.x,
                y: xy.y,
                lat,
                lon,
                timestamp,
                accuracy: 1.0,
                speed: 0
            });
            this.drawGPSCanvas();
        },

        calculateDistance(lat1, lon1, lat2, lon2) {
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            return this.gpsTracker.EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        },

        updateScaleInfo() {
            const viewRange = (this.gpsTracker.canvas.width - this.gpsTracker.MARGIN * 2) / this.gpsTracker.pixelsPerMeter;
            const scaleText = `${this.getGridSpacing()} m/div`;
            const rangeText = `${viewRange.toFixed(0)} m x ${viewRange.toFixed(0)} m`;
            const ctx = this.gpsTracker.ctx;
            ctx.fillStyle = '#000000ff';
            ctx.font = '10px Arial, sans-serif';
            ctx.fillText(scaleText, 10, this.gpsTracker.canvas.height - 25);
            ctx.fillText(rangeText, 10, this.gpsTracker.canvas.height - 10);
        },

        startGPSTracking() {
            // Check already tracking
            if (this.gpsTracker.isTracking) {
                console.log('GPS already tracking');
                toastr.info('GPS Tracking already active');
                return;
            }

            // Get current GPS data
            const lat = this.vehicleData.lat;
            const lon = this.vehicleData.long;

            // Debug log
            console.log('START clicked - GPS Data:', { lat, lon });

            // Validasi data GPS tersedia dan valid
            if (!lat || !lon || lat === 0 || lon === 0) {
                console.warn('GPS data not ready:', { lat, lon });
                toastr.warning('Waiting for valid GPS data from vehicle...', 'Please Wait', {
                    timeOut: 3000
                });

                // Retry maksimal 10x (20 detik total)
                if (!this.gpsTracker.retryCount) {
                    this.gpsTracker.retryCount = 0;
                }

                this.gpsTracker.retryCount++;

                if (this.gpsTracker.retryCount < 10) {
                    console.log(`Retry ${this.gpsTracker.retryCount}/10 in 2 seconds...`);
                    setTimeout(() => this.startGPSTracking(), 2000);
                } else {
                    console.error('Max retry reached. GPS data still not available.');
                    toastr.error('Cannot start tracking. GPS data not available.', 'Error');
                    this.gpsTracker.retryCount = 0;
                }
                return;
            }

            // Reset retry counter
            this.gpsTracker.retryCount = 0;

            // Set origin GPS dari posisi saat ini
            this.gpsTracker.originGPS = {
                lat: lat,
                lon: lon
            };
            this.gpsTracker.startTime = Date.now();

            // Mulai tracking
            this.gpsTracker.isTracking = true;

            console.log('✓ GPS Tracking started - Origin set:', this.gpsTracker.originGPS);
            toastr.success(
                `Origin GPS set!\nLat: ${lat.toFixed(6)}\nLon: ${lon.toFixed(6)}`,
                'GPS Started!',
                { timeOut: 5000 }
            );

            // Optional: Browser GPS sebagai fallback
            if (navigator.geolocation) {
                this.gpsTracker.watchId = navigator.geolocation.watchPosition(
                    pos => {
                        // Gunakan hanya jika vehicleData.lat masih 0
                        if (!this.vehicleData.lat || this.vehicleData.lat === 0) {
                            console.log('Using browser GPS as fallback');
                            this.vehicleData.lat = pos.coords.latitude;
                            this.vehicleData.long = pos.coords.longitude;
                        }
                    },
                    err => console.warn('Browser GPS error:', err.message),
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            }
        },

        stopGPSTracking() {
            if (this.gpsTracker.watchId) navigator.geolocation.clearWatch(this.gpsTracker.watchId);
            this.gpsTracker.isTracking = false;
            toastr.info('Tracking stopped');
        },

        clearGPSPath() {
            if (!confirm('Clear GPS data?')) return;
            if (this.gpsTracker.isTracking) this.stopGPSTracking();
            Object.assign(this.gpsTracker, {
                path: [],
                originGPS: null,
                totalDistance: 0,
                startTime: null,
                retryCount: 0
            });
            this.drawGPSCanvas();
            toastr.success('GPS data cleared');
        },

        async requestWakeLock() {
            try {
                if ('wakeLock' in navigator) {
                    this.gpsTracker.wakeLock = await navigator.wakeLock.request('screen');
                }
            }
            catch {
                console.log('Wake lock unsupported');
            }
        },
    };
};

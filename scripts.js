// Plant Disease Detection System - Dashboard JavaScript
// ESP32 WiFi Control Integration

class PlantDiseaseDetectionSystem {
    constructor() {
        // ESP32 Configuration
        this.espIP = '192.168.1.100'; // Default ESP32 IP - update as needed
        this.espPort = '80';
        this.baseURL = `http://${this.espIP}:${this.espPort}`;
        
        // System state
        this.sensorData = {
            temperature: 0,
            humidity: 0,
            soilMoisture: 0,
            soilPH: 0
        };
        
        this.systemState = {
            pumpStatus: false,
            systemMode: 'auto',
            lastDetection: 'No disease detected',
            confidenceLevel: 0,
            recommendedAction: 'Monitor'
        };
        
        // Data storage for charts
        this.historicalData = {
            labels: [],
            temperature: [],
            humidity: [],
            soilMoisture: []
        };
        
        this.activityLog = [];
        this.charts = {};
        
        // Initialize system
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.initializeCharts();
        this.updateTimestamp();
        this.startDataPolling();
        this.addLogEntry('System initialized', 'SUCCESS');
        
        // Try to connect to ESP32
        try {
            await this.testESPConnection();
            this.addLogEntry('ESP32 connection established', 'SUCCESS');
        } catch (error) {
            this.addLogEntry('ESP32 connection failed - using demo mode', 'WARNING');
            this.startDemoMode();
        }
    }
    
    // ESP32 Communication Methods
    async sendESPCommand(endpoint, data = null) {
        try {
            const url = `${this.baseURL}${endpoint}`;
            const options = {
                method: data ? 'POST' : 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: data ? JSON.stringify(data) : null
            };
            
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('ESP32 communication error:', error);
            throw error;
        }
    }
    
    async testESPConnection() {
        return await this.sendESPCommand('/status');
    }
    
    async fetchSensorData() {
        try {
            const data = await this.sendESPCommand('/sensors');
            this.updateSensorData(data);
            return data;
        } catch (error) {
            console.error('Failed to fetch sensor data:', error);
            return null;
        }
    }
    
    async controlPump(action) {
        try {
            const response = await this.sendESPCommand('/pump', { action: action });
            this.systemState.pumpStatus = action === 'start';
            this.updatePumpStatus();
            this.addLogEntry(`Water pump ${action}ed`, 'SUCCESS');
            return response;
        } catch (error) {
            this.addLogEntry(`Failed to ${action} water pump`, 'ERROR');
            throw error;
        }
    }
    
    async triggerSpray(duration) {
        try {
            const response = await this.sendESPCommand('/spray', { duration: duration });
            this.addLogEntry(`Manual spray activated for ${duration}s`, 'SUCCESS');
            return response;
        } catch (error) {
            this.addLogEntry('Failed to activate spray system', 'ERROR');
            throw error;
        }
    }
    
    async captureAndAnalyze() {
        try {
            this.showLoadingState();
            const response = await this.sendESPCommand('/capture');
            
            // Simulate disease detection processing
            await this.processImageAnalysis(response);
            this.addLogEntry('Image captured and analyzed', 'SUCCESS');
            return response;
        } catch (error) {
            this.addLogEntry('Failed to capture and analyze image', 'ERROR');
            this.hideLoadingState();
            throw error;
        }
    }
    
    async setSystemMode(mode) {
        try {
            const response = await this.sendESPCommand('/mode', { mode: mode });
            this.systemState.systemMode = mode;
            this.addLogEntry(`System mode changed to ${mode}`, 'SUCCESS');
            return response;
        } catch (error) {
            this.addLogEntry(`Failed to change system mode to ${mode}`, 'ERROR');
            throw error;
        }
    }
    
    // UI Event Handlers
    setupEventListeners() {
        // Pump controls
        document.getElementById('pumpOn').addEventListener('click', () => {
            this.controlPump('start');
        });
        
        document.getElementById('pumpOff').addEventListener('click', () => {
            this.controlPump('stop');
        });
        
        // Manual spray
        document.getElementById('manualSpray').addEventListener('click', () => {
            const duration = document.getElementById('sprayDuration').value;
            this.triggerSpray(parseInt(duration));
        });
        
        // System mode change
        document.getElementById('systemMode').addEventListener('change', (e) => {
            this.setSystemMode(e.target.value);
        });
        
        // Emergency controls
        document.getElementById('emergencyStop').addEventListener('click', () => {
            this.emergencyStop();
        });
        
        document.getElementById('systemReset').addEventListener('click', () => {
            this.systemReset();
        });
        
        // Disease detection
        document.getElementById('captureImage').addEventListener('click', () => {
            this.captureAndAnalyze();
        });
        
        // Update timestamp every second
        setInterval(() => {
            this.updateTimestamp();
        }, 1000);
    }
    
    // Data Processing Methods
    updateSensorData(data) {
        // Update sensor values
        this.sensorData = { ...this.sensorData, ...data };
        
        // Update UI
        document.getElementById('temperature').textContent = this.sensorData.temperature.toFixed(1);
        document.getElementById('humidity').textContent = this.sensorData.humidity.toFixed(1);
        document.getElementById('soilMoisture').textContent = this.sensorData.soilMoisture.toFixed(1);
        document.getElementById('soilPH').textContent = this.sensorData.soilPH.toFixed(1);
        
        // Update status indicators
        this.updateStatusIndicators();
        
        // Add to historical data
        this.addToHistoricalData();
        
        // Update charts
        this.updateCharts();
        
        // Check for alerts
        this.checkAlerts();
    }
    
    updateStatusIndicators() {
        // Temperature status
        const tempCard = document.querySelector('.stat-card .card-status');
        if (this.sensorData.temperature >= 20 && this.sensorData.temperature <= 30) {
            tempCard.className = 'card-status normal';
            tempCard.textContent = 'Normal Range';
        } else {
            tempCard.className = 'card-status warning';
            tempCard.textContent = 'Outside Range';
        }
        
        // Humidity status
        const humidityCards = document.querySelectorAll('.stat-card .card-status');
        if (this.sensorData.humidity >= 40 && this.sensorData.humidity <= 70) {
            humidityCards[1].className = 'card-status normal';
            humidityCards[1].textContent = 'Optimal';
        } else {
            humidityCards[1].className = 'card-status warning';
            humidityCards[1].textContent = 'Sub-optimal';
        }
        
        // Soil moisture status
        if (this.sensorData.soilMoisture >= 40) {
            humidityCards[2].className = 'card-status normal';
            humidityCards[2].textContent = 'Good';
        } else if (this.sensorData.soilMoisture >= 25) {
            humidityCards[2].className = 'card-status warning';
            humidityCards[2].textContent = 'Low';
        } else {
            humidityCards[2].className = 'card-status critical';
            humidityCards[2].textContent = 'Critical';
        }
        
        // Soil pH status
        if (this.sensorData.soilPH >= 6.0 && this.sensorData.soilPH <= 7.5) {
            humidityCards[3].className = 'card-status normal';
            humidityCards[3].textContent = 'Balanced';
        } else {
            humidityCards[3].className = 'card-status warning';
            humidityCards[3].textContent = 'Imbalanced';
        }
    }
    
    updatePumpStatus() {
        const statusElement = document.getElementById('pumpStatus');
        statusElement.textContent = this.systemState.pumpStatus ? 'ON' : 'OFF';
        statusElement.className = this.systemState.pumpStatus ? 'status-text active' : 'status-text';
    }
    
    addToHistoricalData() {
        const now = new Date();
        const timeLabel = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
        
        this.historicalData.labels.push(timeLabel);
        this.historicalData.temperature.push(this.sensorData.temperature);
        this.historicalData.humidity.push(this.sensorData.humidity);
        this.historicalData.soilMoisture.push(this.sensorData.soilMoisture);
        
        // Keep only last 50 data points
        if (this.historicalData.labels.length > 50) {
            this.historicalData.labels.shift();
            this.historicalData.temperature.shift();
            this.historicalData.humidity.shift();
            this.historicalData.soilMoisture.shift();
        }
    }
    
    async processImageAnalysis(response) {
        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Simulate disease detection results
        const diseases = [
            'No disease detected',
            'Early Blight detected',
            'Late Blight detected',
            'Bacterial Spot detected',
            'Leaf Mold detected'
        ];
        
        const randomDisease = diseases[Math.floor(Math.random() * diseases.length)];
        const confidence = randomDisease === 'No disease detected' ? 0 : Math.floor(Math.random() * 40) + 60;
        
        this.systemState.lastDetection = randomDisease;
        this.systemState.confidenceLevel = confidence;
        this.systemState.recommendedAction = this.getRecommendedAction(randomDisease);
        
        // Update UI
        document.getElementById('lastDetection').textContent = randomDisease;
        document.getElementById('confidenceLevel').textContent = confidence;
        document.getElementById('recommendedAction').textContent = this.systemState.recommendedAction;
        document.getElementById('lastAnalysis').textContent = new Date().toLocaleTimeString();
        
        this.hideLoadingState();
        
        // If disease detected, create alert
        if (randomDisease !== 'No disease detected') {
            this.createAlert('Disease Detected', `${randomDisease} found with ${confidence}% confidence`, 'error');
        }
    }
    
    getRecommendedAction(disease) {
        const actions = {
            'No disease detected': 'Monitor',
            'Early Blight detected': 'Apply fungicide spray',
            'Late Blight detected': 'Immediate treatment required',
            'Bacterial Spot detected': 'Remove affected leaves',
            'Leaf Mold detected': 'Improve ventilation'
        };
        return actions[disease] || 'Consult specialist';
    }
    
    // Alert System
    checkAlerts() {
        // Check soil moisture
        if (this.sensorData.soilMoisture < 25) {
            this.createAlert('Critical Soil Moisture', 'Soil moisture critically low - immediate watering required', 'error');
        } else if (this.sensorData.soilMoisture < 40) {
            this.createAlert('Low Soil Moisture', `Soil moisture below optimal range (${this.sensorData.soilMoisture.toFixed(1)}%)`, 'warning');
        }
        
        // Check temperature
        if (this.sensorData.temperature > 35) {
            this.createAlert('High Temperature', 'Temperature exceeding safe range for plants', 'warning');
        }
        
        // Check pH
        if (this.sensorData.soilPH < 5.5 || this.sensorData.soilPH > 8.0) {
            this.createAlert('Soil pH Imbalance', `Soil pH out of optimal range (${this.sensorData.soilPH.toFixed(1)})`, 'warning');
        }
    }
    
    createAlert(title, message, type) {
        const alertsPanel = document.getElementById('alertsPanel');
        
        // Check if alert already exists
        const existingAlert = Array.from(alertsPanel.children).find(alert => 
            alert.querySelector('strong').textContent === title
        );
        
        if (existingAlert) return; // Don't create duplicate alerts
        
        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${type}`;
        
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : 
                    type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle';
        
        alertElement.innerHTML = `
            <i class="${icon}"></i>
            <div>
                <strong>${title}</strong>
                <p>${message}</p>
                <small>Just now</small>
            </div>
        `;
        
        alertsPanel.insertBefore(alertElement, alertsPanel.firstChild);
        
        // Remove old alerts (keep only 5)
        while (alertsPanel.children.length > 5) {
            alertsPanel.removeChild(alertsPanel.lastChild);
        }
        
        // Auto-remove alert after 30 seconds
        setTimeout(() => {
            if (alertElement.parentNode) {
                alertElement.remove();
            }
        }, 30000);
    }
    
    // Activity Log
    addLogEntry(action, status) {
        const timestamp = new Date().toLocaleString();
        const logEntry = { timestamp, action, status };
        
        this.activityLog.unshift(logEntry);
        
        // Keep only last 50 entries
        if (this.activityLog.length > 50) {
            this.activityLog.pop();
        }
        
        this.updateActivityLog();
    }
    
    updateActivityLog() {
        const logContent = document.getElementById('activityLog');
        logContent.innerHTML = '';
        
        this.activityLog.slice(0, 10).forEach(entry => {
            const logElement = document.createElement('div');
            logElement.className = 'log-entry';
            logElement.innerHTML = `
                <span class="timestamp">${entry.timestamp}</span>
                <span class="action">${entry.action}</span>
                <span class="status ${entry.status.toLowerCase()}">${entry.status}</span>
            `;
            logContent.appendChild(logElement);
        });
    }
    
    // Chart Management
    initializeCharts() {
        // Environmental trends chart
        const envCtx = document.getElementById('environmentChart').getContext('2d');
        this.charts.environment = new Chart(envCtx, {
            type: 'line',
            data: {
                labels: this.historicalData.labels,
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: this.historicalData.temperature,
                        borderColor: '#ff6b6b',
                        backgroundColor: 'rgba(255, 107, 107, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Humidity (%)',
                        data: this.historicalData.humidity,
                        borderColor: '#4ecdc4',
                        backgroundColor: 'rgba(78, 205, 196, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Soil Moisture (%)',
                        data: this.historicalData.soilMoisture,
                        borderColor: '#45b7d1',
                        backgroundColor: 'rgba(69, 183, 209, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
        
        // System activity chart
        const actCtx = document.getElementById('activityChart').getContext('2d');
        this.charts.activity = new Chart(actCtx, {
            type: 'doughnut',
            data: {
                labels: ['Success', 'Warning', 'Error'],
                datasets: [{
                    data: [85, 12, 3],
                    backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    updateCharts() {
        if (this.charts.environment) {
            this.charts.environment.data.labels = this.historicalData.labels;
            this.charts.environment.data.datasets[0].data = this.historicalData.temperature;
            this.charts.environment.data.datasets[1].data = this.historicalData.humidity;
            this.charts.environment.data.datasets[2].data = this.historicalData.soilMoisture;
            this.charts.environment.update('none');
        }
    }
    
    // Utility Methods
    updateTimestamp() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleString();
    }
    
    showLoadingState() {
        const captureBtn = document.getElementById('captureImage');
        captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        captureBtn.disabled = true;
    }
    
    hideLoadingState() {
        const captureBtn = document.getElementById('captureImage');
        captureBtn.innerHTML = 'Capture & Analyze';
        captureBtn.disabled = false;
    }
    
    // Emergency Controls
    async emergencyStop() {
        try {
            await this.sendESPCommand('/emergency/stop');
            this.systemState.pumpStatus = false;
            this.updatePumpStatus();
            this.addLogEntry('Emergency stop activated', 'WARNING');
            this.createAlert('Emergency Stop', 'All systems stopped immediately', 'error');
        } catch (error) {
            this.addLogEntry('Emergency stop failed', 'ERROR');
        }
    }
    
    async systemReset() {
        try {
            await this.sendESPCommand('/system/reset');
            this.addLogEntry('System reset initiated', 'SUCCESS');
            this.createAlert('System Reset', 'System reset completed successfully', 'info');
            
            // Reset UI
            setTimeout(() => {
                location.reload();
            }, 2000);
        } catch (error) {
            this.addLogEntry('System reset failed', 'ERROR');
        }
    }
    
    // Data Polling
    startDataPolling() {
        // Poll sensor data every 5 seconds
        this.pollingInterval = setInterval(async () => {
            await this.fetchSensorData();
        }, 5000);
    }
    
    stopDataPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
    }
    
    // Demo Mode (when ESP32 is not connected)
    startDemoMode() {
        console.log('Starting demo mode...');
        this.demoInterval = setInterval(() => {
            // Generate realistic sensor data
            const demoData = {
                temperature: 22 + Math.random() * 8, // 22-30°C
                humidity: 50 + Math.random() * 20, // 50-70%
                soilMoisture: 30 + Math.random() * 40, // 30-70%
                soilPH: 6.0 + Math.random() * 1.5 // 6.0-7.5
            };
            
            this.updateSensorData(demoData);
        }, 3000);
    }
    
    stopDemoMode() {
        if (this.demoInterval) {
            clearInterval(this.demoInterval);
        }
    }
}

// Footer function implementations
function showSettings() {
    alert('Settings panel would open here. Configure ESP32 IP, sensor thresholds, etc.');
}

function downloadReport() {
    // Generate and download system report
    const reportData = {
        timestamp: new Date().toISOString(),
        sensorData: system.sensorData,
        systemState: system.systemState,
        activityLog: system.activityLog.slice(0, 20)
    };
    
    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `plant-system-report-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

function showHelp() {
    const helpContent = `
    Plant Disease Detection System Help:
    
    1. Monitor environmental conditions in real-time
    2. Use manual controls for water pump and spray system
    3. Capture images for disease detection analysis
    4. View historical trends and system activity
    5. Respond to alerts and warnings
    
    ESP32 Configuration:
    - Default IP: 192.168.1.100
    - Ensure ESP32 is connected to same network
    - Check serial monitor for connection status
    
    For technical support, contact: support@plantdetection.com
    `;
    
    alert(helpContent);
}

// Initialize system when page loads
let system;
document.addEventListener('DOMContentLoaded', () => {
    system = new PlantDiseaseDetectionSystem();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        system.stopDataPolling();
    } else {
        system.startDataPolling();
    }
});
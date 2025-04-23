import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';

function App() {
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(2);
    const [error, setError] = useState(null);
    const waveSurferRef = useRef(null);
    const waveformRef = useRef(null);
    const [audioUrl, setAudioUrl] = useState('');

    useEffect(() => {
        if (!waveformRef.current) {
            setError('Waveform container not found.');
            return;
        }

        let isMounted = true;

        const initializeWaveSurfer = async () => {
            try {
                // Initialize Telegram Web App
                if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                }

                // Get audio URL from query params or use local file
                const urlParams = new URLSearchParams(window.location.search);
                const audio = urlParams.get('audio');
                const url = audio || '/audio/Audio-Bus256.wav';
                setAudioUrl(url);

                // Initialize Regions plugin
                const regions = RegionsPlugin.create();

                // Initialize WaveSurfer
                waveSurferRef.current = WaveSurfer.create({
                    container: waveformRef.current,
                    waveColor: '#4B5563',
                    progressColor: '#3B82F6',
                    cursorColor: '#1F2937',
                    height: 100,
                    plugins: [regions],
                });

                // Handle load errors
                waveSurferRef.current.on('error', (err) => {
                    if (isMounted) {
                        console.error('WaveSurfer error:', err);
                        setError('Failed to load audio: ' + err.message);
                    }
                });

                // Wait for audio to be ready
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Load audio
                if (isMounted) {
                    waveSurferRef.current.load(url);
                }

                // Add regions after audio is decoded
                waveSurferRef.current.on('decode', () => {
                    // Selection region (highlighted area)
                    regions.addRegion({
                        id: 'selection',
                        start: 0,
                        end: 2,
                        content: 'Cramped region',
                        minLength: 1,
                        maxLength: 10,
                        color: 'rgba(59, 130, 246, 0.3)',
                    });
                });

                let activeRegion = null
                regions.on('region-in', (region) => {
                    console.log('region-in', region)
                    activeRegion = region
                })
                regions.on('region-out', (region) => {
                    console.log('region-out', region)
                    if (activeRegion === region) {
                            activeRegion = null
                    }
                })

                // Update start/end times
                regions.on('region-updated', (region) => {
                    if (!isMounted) return;

                    try {
                        if (region.id === 'selection') {
                            let newStart = region.start;
                            let newEnd = region.end;

                            // Ensure start < end
                            if (newStart >= newEnd) {
                                newEnd = newStart + 0.1;
                                region.end = newEnd;
                            }

                            // Restrict to audio duration
                            const audioDuration = waveSurferRef.current.getDuration() || 100;
                            if (newStart < 0) {
                                newStart = 0;
                                newEnd = newStart + (region.end - region.start);
                                region.start = newStart;
                                region.end = newEnd;
                            } else if (newEnd > audioDuration) {
                                newEnd = audioDuration;
                                newStart = newEnd - (region.end - region.start);
                                region.start = newStart;
                                region.end = newEnd;
                            }

                            setStartTime(newStart);
                            setEndTime(newEnd);
                        }
                    } catch (err) {
                        console.error('Error updating region:', err);
                        setError('Error updating region. Please try again.');
                    }
                });

                regions.on('region-clicked', (region, e) => {
                    e.stopPropagation() // prevent triggering a click on the waveform
                    activeRegion = region
                    region.play(true)
                })

            } catch (err) {
                if (isMounted) {
                    console.error('Error initializing WaveSurfer:', err);
                    setError('Failed to initialize audio player: ' + err.message);
                }
            }
        };

        initializeWaveSurfer();

        return () => {
            isMounted = false;
            if (waveSurferRef.current) {
                try {
                    waveSurferRef.current.destroy();
                } catch (err) {
                    console.error('Error destroying WaveSurfer:', err);
                }
            }
        };
    }, []);

    const handleCut = () => {
        // Format times to MM:SS
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        // Prepare data
        const data = {
            startTime: formatTime(startTime),
            endTime: formatTime(endTime),
        };

        // Send data to Telegram
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.sendData(JSON.stringify(data));
        } else {
            console.log('Telegram WebApp not available', data);
        }
    };

    if (error) {
        return (
            <div className="p-4 bg-gray-100 min-h-screen">
                <h1 className="text-2xl font-bold mb-4">Audio Cutter</h1>
                <p className="text-red-500">{error}</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-gray-100 min-h-screen">
            <h1 className="text-2xl font-bold mb-4">Audio Cutter</h1>
            <div ref={waveformRef} className="mb-4"></div>
            <div className="mb-4">
                <p>Start: {startTime.toFixed(2)}s</p>
                <p>End: {endTime.toFixed(2)}s</p>
            </div>
            <button
                onClick={handleCut}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
                Cut Audio
            </button>
        </div>
    );
}

export default App;
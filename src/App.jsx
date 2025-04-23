import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions'; // Исправленный импорт

function App() {
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(0);
    const [error, setError] = useState(null); // Для обработки ошибок
    const waveSurferRef = useRef(null);
    const [audioUrl, setAudioUrl] = useState('');

    useEffect(() => {
        try {
            // Initialize Telegram Web App
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.ready();
                window.Telegram.WebApp.expand();
            }

            // Get audio URL from query params
            const urlParams = new URLSearchParams(window.location.search);
            const audio = urlParams.get('audio');
            setAudioUrl(audio || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');

            // Initialize WaveSurfer
            waveSurferRef.current = WaveSurfer.create({
                container: '#waveform',
                waveColor: '#4B5563',
                progressColor: '#3B82F6',
                cursorColor: '#1F2937',
                height: 100,
            });

            // Create and register Regions plugin
            const regions = RegionsPlugin.create();
            waveSurferRef.current.registerPlugin(regions); // Исправленный метод

            // Load audio
            waveSurferRef.current.load(audioUrl);

            // Update start/end times when region changes
            regions.on('region-updated', (region) => {
                setStartTime(region.start);
                setEndTime(region.end);
            });

            // Add initial region
            regions.addRegion({
                id: 'cut',
                start: 0,
                end: 10,
                drag: true,
                resize: true,
            });

        } catch (err) {
            console.error('Error initializing WaveSurfer:', err);
            setError('Failed to load audio player. Please try again.');
        }

        return () => {
            if (waveSurferRef.current) {
                waveSurferRef.current.destroy();
            }
        };
    }, [audioUrl]);

    const handleCut = () => {
        // Format times to MM:SS
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        // Send data to Telegram
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.sendData(
                JSON.stringify({
                    startTime: formatTime(startTime),
                    endTime: formatTime(endTime),
                })
            );
        } else {
            console.log('Telegram WebApp not available', {
                startTime: formatTime(startTime),
                endTime: formatTime(endTime),
            });
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
            <div id="waveform" className="mb-4"></div>
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
import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import './App.css';

function App() {
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(2);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [initData, setInitData] = useState(null);
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
                if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                    window.Telegram.WebApp.BackButton.show();
                    window.Telegram.WebApp.BackButton.onClick(() => {
                        window.Telegram.WebApp.close();
                    });

                    const initDataRaw = window.Telegram.WebApp.initData;
                    const initDataUnsafe = window.Telegram.WebApp.initDataUnsafe;

                    setInitData({
                        raw: initDataRaw,
                        unsafe: initDataUnsafe,
                        version: window.Telegram.WebApp.version,
                        platform: window.Telegram.WebApp.platform,
                    });

                    console.log("Telegram WebApp initData:", initDataRaw);
                    console.log("Telegram WebApp initDataUnsafe:", initDataUnsafe);
                    console.log("Telegram WebApp version:", window.Telegram.WebApp.version);
                    console.log("Telegram WebApp platform:", window.Telegram.WebApp.platform);
                } else {
                    setError("Telegram WebApp API не доступен. Пожалуйста, откройте приложение через Telegram.");
                    return;
                }

                const urlParams = new URLSearchParams(window.location.search);
                const audio = urlParams.get('audio');
                const url = audio || '/audio/Audio-Bus256.wav';
                setAudioUrl(url);

                const regions = RegionsPlugin.create();

                waveSurferRef.current = WaveSurfer.create({
                    container: waveformRef.current,
                    waveColor: '#4B5563',
                    progressColor: '#3B82F6',
                    cursorColor: '#1F2937',
                    height: 100,
                    plugins: [regions],
                });

                waveSurferRef.current.on('error', (err) => {
                    if (isMounted) {
                        console.error('WaveSurfer error:', err);
                        setError('Failed to load audio: ' + err.message);
                    }
                });

                await new Promise((resolve) => setTimeout(resolve, 100));

                if (isMounted) {
                    waveSurferRef.current.load(url);
                }

                waveSurferRef.current.on('decode', () => {
                    regions.addRegion({
                        id: 'selection',
                        start: 0,
                        end: 2,
                        content: 'Audio selection',
                        minLength: 1,
                        maxLength: 10,
                        color: 'rgba(59, 130, 246, 0.3)',
                    });
                });

                regions.on('region-updated', (region) => {
                    if (!isMounted || region.id !== 'selection') return;

                    let newStart = region.start;
                    let newEnd = region.end;

                    if (newStart >= newEnd) {
                        newEnd = newStart + 0.1;
                        region.end = newEnd;
                    }

                    const audioDuration = waveSurferRef.current.getDuration() || 100;
                    if (newEnd > audioDuration) {
                        newEnd = audioDuration;
                        newStart = Math.max(0, newEnd - (region.end - region.start));
                        region.start = newStart;
                        region.end = newEnd;
                    }

                    setStartTime(newStart);
                    setEndTime(newEnd);
                });

                regions.on('region-clicked', (region, e) => {
                    e.stopPropagation();
                    region.play(true);
                });
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

    const handleCut = async () => {
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        const data = {
            startTime: formatTime(startTime),
            endTime: formatTime(endTime),
        };

        if (window.Telegram?.WebApp) {
            try {
                window.Telegram.WebApp.sendData(JSON.stringify(data));
                alert('✅ Данные отправлены в Telegram!');
                setSuccessMessage('Audio segment sent! Check the chat for your cut audio.');
            } catch (error) {
                console.error('Error sending data:', error);
                alert('❌ Ошибка отправки: ' + error.message);
                setError('Failed to send data: ' + error.message);
            }
        } else {
            alert('❌ Telegram WebApp не обнаружен!');
            setError('Telegram WebApp API не доступен. Пожалуйста, откройте приложение через Telegram.');
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
            {successMessage && <p className="text-green-500 mb-4">{successMessage}</p>}
            <button
                onClick={handleCut}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
            >
                Cut Audio
            </button>
            {initData && (
                <div className="text-sm bg-white p-2 mt-4 rounded shadow">
                    <p><strong>Platform:</strong> {initData.platform}</p>
                    <p><strong>Version:</strong> {initData.version}</p>
                    <p><strong>User ID:</strong> {initData.unsafe?.user?.id || 'null'}</p>
                    <p><strong>Query ID:</strong> {initData.unsafe?.query_id || 'null'}</p>
                </div>
            )}
        </div>
    );
}

export default App;

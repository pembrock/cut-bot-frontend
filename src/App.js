import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import './App.css';

function App() {
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(2);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [initDataUnsafe, setInitDataUnsafe] = useState(null);
    const waveSurferRef = useRef(null);
    const waveformRef = useRef(null);
    const [audioUrl, setAudioUrl] = useState('');

    useEffect(() => {
        if (!waveformRef.current) {
            setError('Не найден контейнер для волновой формы.');
            return;
        }

        let isMounted = true;

        const initializeWaveSurfer = async () => {
            try {
                // Проверяем Telegram WebApp
                if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();
                    window.Telegram.WebApp.BackButton.show();
                    window.Telegram.WebApp.BackButton.onClick(() => {
                        window.Telegram.WebApp.close();
                    });

                    const initDataRaw = window.Telegram.WebApp.initData;
                    const initData = window.Telegram.WebApp.initDataUnsafe;
                    setInitDataUnsafe(initData);

                    console.log("Telegram WebApp initData:", initDataRaw);
                    console.log("Telegram WebApp initDataUnsafe:", initData);
                } else {
                    setError("Telegram WebApp API недоступен. Откройте приложение через Telegram.");
                    return;
                }

                // Получаем URL аудиофайла
                const urlParams = new URLSearchParams(window.location.search);
                const audioParam = urlParams.get('audio');
                const audioUrlValue = audioParam || '/audio/Audio-Bus256.wav';
                setAudioUrl(audioUrlValue);
                console.log("🔊 Audio URL:", audioUrlValue);

                // Создаём Regions плагин
                const regions = RegionsPlugin.create({
                    drag: true,
                    resize: true,
                    minLength: 1,
                    maxLength: 30
                });

                // Инициализируем WaveSurfer
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
                        console.error('🚨 WaveSurfer error:', err);
                        setError(`Ошибка загрузки аудио: ${err.message || err}`);
                    }
                });

                waveSurferRef.current.on('load', (url) => {
                    console.log('📡 WaveSurfer loading:', url);
                });

                waveSurferRef.current.on('ready', () => {
                    console.log('✅ WaveSurfer ready');
                });

                waveSurferRef.current.on('decode', () => {
                    console.log('🔊 Audio decoded');
                });

                // Загружаем аудио
                console.log('⏳ Starting WaveSurfer load...');
                waveSurferRef.current.load(audioUrlValue);

                // Добавляем регион
                waveSurferRef.current.on('decode', () => {
                    console.log('🔊 Region added');
                    regions.addRegion({
                        id: 'selection',
                        start: startTime,
                        end: endTime,
                        content: 'Выбранный фрагмент',
                        color: 'rgba(59, 130, 246, 0.3)',
                    });
                });

                // Обновляем временные метки
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
                    console.error('🚨 Ошибка инициализации WaveSurfer:', err);
                    setError(`Ошибка инициализации проигрывателя: ${err.message}`);
                }
            }
        };

        initializeWaveSurfer();

        return () => {
            isMounted = false;
            if (waveSurferRef.current) {
                const ws = waveSurferRef.current;
                waveSurferRef.current = null;
                try {
                    ws.destroy();
                    console.log("WaveSurfer успешно уничтожен");
                } catch (err) {
                    console.error("Ошибка при уничтожении WaveSurfer:", err);
                }
            }
        };
    }, []);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleCut = async () => {
        const data = {
            user_id: initDataUnsafe?.user?.id || 142413225,
            start_time: formatTime(startTime),
            end_time: formatTime(endTime),
        };

        console.log("📤 Sending to backend:", data);
        const backendUrl = "https://e2b0-142-93-44-239.ngrok-free.app/save-segment";

        try {
            const response = await fetch(backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            if (response.ok) {
                setSuccessMessage("✅ Segment saved and processed!");
                window.Telegram.WebApp.close();
            } else {
                throw new Error(result.detail || "Failed to send data");
            }

            // Логи на Vercel
            await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'sendData_backend',
                    data,
                    userId: data.user_id,
                    backendUrl,
                    response: result,
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    timestamp: new Date().toISOString(),
                }),
            });
        } catch (err) {
            console.error("⚠️ Error sending to backend:", err);
            setError("❌ Failed to send data: " + err.message);

            // Логируем ошибку на Vercel
            await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'sendData_backend_error',
                    error: err.message,
                    data,
                    userId: data.user_id,
                    backendUrl,
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    timestamp: new Date().toISOString(),
                }),
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
            <div ref={waveformRef} className="mb-4 border border-gray-300 rounded p-2 bg-white"></div>
            <div className="mb-4 text-center">
                <p>Начало: <strong>{formatTime(startTime)}</strong></p>
                <p>Конец: <strong>{formatTime(endTime)}</strong></p>
            </div>
            {successMessage && (
                <p className="text-green-500 mb-4">{successMessage}</p>
            )}
            <button
                onClick={handleCut}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
            >
                Cut Audio
            </button>
            {initDataUnsafe && (
                <div className="mt-4 text-sm bg-white p-2 rounded shadow">
                    <p><strong>User ID:</strong> {initDataUnsafe.user?.id || 'не указан'}</p>
                    <p><strong>Query ID:</strong> {initDataUnsafe.query_id || 'не указан'}</p>
                    <p><strong>Platform:</strong> {initDataUnsafe.platform}</p>
                </div>
            )}
        </div>
    );
}

export default App;
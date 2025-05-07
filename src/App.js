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
    const [telegramInfo, setTelegramInfo] = useState({});
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

                    const tgInfo = {
                        version: window.Telegram.WebApp.version,
                        platform: window.Telegram.WebApp.platform,
                        initDataRaw: initDataRaw || 'empty',
                        initDataUnsafe: initData || {},
                        isClosingConfirmationEnabled: window.Telegram.WebApp.isClosingConfirmationEnabled,
                        isExpanded: window.Telegram.WebApp.isExpanded,
                        themeParams: window.Telegram.WebApp.themeParams || {},
                    };
                    setTelegramInfo(tgInfo);

                    console.log("📱 Telegram WebApp Info:", tgInfo);
                    // Логируем на Vercel
                    fetch('/api/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'telegram_webapp_info',
                            data: tgInfo,
                            userId: initData?.user?.id || 'unknown',
                            timestamp: new Date().toISOString(),
                        }),
                    }).catch(err => console.error("⚠️ Vercel log error:", err));
                } else {
                    setError("Telegram WebApp API недоступен. Откройте приложение через Telegram.");
                    return;
                }

                // Получаем URL аудиофайла
                const urlParams = new URLSearchParams(window.location.search);
                const audioUrlValue = urlParams.get('audio');
                if (!audioUrlValue) {
                    setError("URL аудиофайла не указан.");
                    return;
                }
                setAudioUrl(audioUrlValue);
                console.log("🔊 Audio URL:", audioUrlValue);

                // Проверяем Telegram WebApp версию и платформу
                console.log("🌐 Telegram WebApp version:", window.Telegram?.WebApp?.version);
                console.log("💻 Platform:", window.Telegram?.WebApp?.platform);

                // Тестовый запрос к бэкенду
                console.log("🧪 Starting test fetch to backend...");
                try {
                    const testResponse = await fetch(audioUrlValue, {
                        method: 'GET',
                        headers: { 'Accept': 'audio/mpeg' }
                    });
                    console.log("🧪 Test fetch response:", {
                        status: testResponse.status,
                        statusText: testResponse.statusText,
                        headers: Object.fromEntries(testResponse.headers.entries())
                    });
                    if (!testResponse.ok) {
                        throw new Error(`Test fetch failed: ${testResponse.status} ${testResponse.statusText}`);
                    }
                    const contentType = testResponse.headers.get('content-type');
                    if (!contentType.includes('audio/mpeg')) {
                        throw new Error(`Invalid content-type: ${contentType}`);
                    }
                } catch (err) {
                    console.error("⚠️ Test fetch error:", err);
                    setError(`Ошибка тестового запроса: ${err.message}`);
                    return;
                }

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
                        if (err instanceof MediaError) {
                            console.error('🚨 MediaError details:', {
                                code: err.code,
                                message: err.message,
                                name: err.name
                            });
                            setError(`Ошибка загрузки аудио: MediaError (code: ${err.code}, message: ${err.message})`);
                        } else {
                            setError(`Ошибка загрузки аудио: ${err.message || err}`);
                        }
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

    const handleCut = () => {
        const data = {
            startTime: formatTime(startTime),
            endTime: formatTime(endTime),
        };

        console.log("📤 Sending to Telegram:", data);
        try {
            // Проверяем initData
            if (!window.Telegram.WebApp.initData) {
                throw new Error("initData is empty or invalid");
            }

            window.Telegram.WebApp.sendData(JSON.stringify(data));
            setSuccessMessage("✅ Данные отправлены в Telegram!");
            setTimeout(() => {
                window.Telegram.WebApp.close();
            }, 1000);

            // Логи на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'sendData_telegram',
                    data,
                    userId: initDataUnsafe?.user?.id || 'unknown',
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    telegramInfo,
                    timestamp: new Date().toISOString(),
                }),
            }).catch(err => console.error("⚠️ Vercel log error:", err));
        } catch (err) {
            console.error("⚠️ Error sending to Telegram:", err);
            setError("❌ Ошибка отправки данных: " + err.message);

            // Логируем ошибку на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'sendData_telegram_error',
                    error: err.message,
                    data,
                    userId: initDataUnsafe?.user?.id || 'unknown',
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    telegramInfo,
                    timestamp: new Date().toISOString(),
                }),
            }).catch(err => console.error("⚠️ Vercel log error:", err));
        }
    };

    const handleTest = async () => {
        const testData = { test: "ping", userId: initDataUnsafe?.user?.id || 'unknown' };
        console.log("📤 Sending test POST to /test:", testData);
        try {
            const response = await fetch('https://bot.pembrock.ru/api/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData),
            });
            const result = await response.json();
            console.log("📡 Response from /test:", result);

            setSuccessMessage("✅ Тестовый запрос отправлен!");
            setTimeout(() => {
                window.Telegram.WebApp.close();
            }, 100);

            // Логи на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'test_post',
                    data: testData,
                    response: result,
                    userId: initDataUnsafe?.user?.id || 'unknown',
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    telegramInfo,
                    timestamp: new Date().toISOString(),
                }),
            }).catch(err => console.error("⚠️ Vercel log error:", err));
        } catch (err) {
            console.error("⚠️ Error sending test POST:", err);
            setError("❌ Ошибка тестового запроса: " + err.message);

            // Логируем ошибку на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'test_post_error',
                    error: err.message,
                    data: testData,
                    userId: initDataUnsafe?.user?.id || 'unknown',
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    telegramInfo,
                    timestamp: new Date().toISOString(),
                }),
            }).catch(err => console.error("⚠️ Vercel log error:", err));
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
            <div className="flex space-x-4">
                <button
                    onClick={handleCut}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex-1"
                >
                    Cut Audio
                </button>
                <button
                    onClick={handleTest}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex-1"
                >
                    Test
                </button>
            </div>
            {initDataUnsafe && (
                <div className="mt-4 text-sm bg-white p-2 rounded shadow">
                    <p><strong>User ID:</strong> {initDataUnsafe.user?.id || 'не указан'}</p>
                    <p><strong>Query ID:</strong> {initDataUnsafe.query_id || 'не указан'}</p>
                    <p><strong>Platform:</strong> {telegramInfo.platform || 'не указан'}</p>
                    <p><strong>Version:</strong> {telegramInfo.version || 'не указан'}</p>
                </div>
            )}
        </div>
    );
}

export default App;
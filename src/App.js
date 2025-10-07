import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import './App.css';

const MIN_REGION_LENGTH = 1;
const MAX_REGION_LENGTH = 30;
const SELECTION_REGION_ID = 'selection';

const formatTime = (seconds) => {
    const totalSeconds = Math.max(0, seconds || 0);
    let minutes = Math.floor(totalSeconds / 60);
    let secondsFraction = totalSeconds - minutes * 60;
    let secondsRounded = Math.round(secondsFraction * 100) / 100;

    if (secondsRounded >= 60) {
        minutes += 1;
        secondsRounded -= 60;
    }

    const hasFraction = Math.abs(secondsRounded - Math.round(secondsRounded)) > 0.01;
    const secondsString = hasFraction
        ? secondsRounded.toFixed(2).padStart(5, '0')
        : Math.round(secondsRounded).toString().padStart(2, '0');

    return `${minutes.toString().padStart(2, '0')}:${secondsString}`;
};

const parseTimeInput = (value) => {
    if (typeof value === 'number') {
        return Number.isNaN(value) ? null : value;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return null;
    }

    const normalized = trimmedValue.replace(',', '.');
    const parts = normalized.split(':');

    if (parts.length === 1) {
        const seconds = Number(parts[0]);
        return Number.isNaN(seconds) ? null : Math.max(0, seconds);
    }

    if (parts.length === 2) {
        const minutes = Number(parts[0]);
        const seconds = Number(parts[1]);
        if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
            return null;
        }

        return Math.max(0, minutes * 60 + seconds);
    }

    return null;
};

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
    const [startInput, setStartInput] = useState(formatTime(0));
    const [endInput, setEndInput] = useState(formatTime(2));
    const [inputError, setInputError] = useState(null);
    const [isWaveReady, setIsWaveReady] = useState(false);
    const regionRef = useRef(null);
    const regionsPluginRef = useRef(null);
    const startTimeRef = useRef(startTime);
    const endTimeRef = useRef(endTime);

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
                    minLength: MIN_REGION_LENGTH,
                    maxLength: MAX_REGION_LENGTH,
                });
                regionsPluginRef.current = regions;

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
                    if (isMounted) {
                        setIsWaveReady(true);
                    }
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
                    if (!regionRef.current) {
                        regionRef.current = regions.addRegion({
                            id: SELECTION_REGION_ID,
                            start: startTimeRef.current,
                            end: endTimeRef.current,
                            content: 'Выбранный фрагмент',
                            color: 'rgba(59, 130, 246, 0.3)',
                        });
                    }
                });

                // Обновляем временные метки
                regions.on('region-created', (region) => {
                    if (region.id === SELECTION_REGION_ID) {
                        regionRef.current = region;
                    }
                });

                regions.on('region-updated', (region) => {
                    if (!isMounted || region.id !== SELECTION_REGION_ID) return;

                    const audioDuration = waveSurferRef.current?.getDuration() || 0;
                    const durationLimit = audioDuration || 0;
                    let newStart = Math.max(0, region.start);
                    let newEnd = Math.max(0, region.end);

                    if (durationLimit) {
                        newStart = Math.min(newStart, durationLimit);
                        newEnd = Math.min(newEnd, durationLimit);
                    }

                    if (durationLimit && durationLimit < MIN_REGION_LENGTH) {
                        newStart = 0;
                        newEnd = durationLimit;
                    }

                    if (newEnd <= newStart) {
                        newEnd = newStart + MIN_REGION_LENGTH;
                    }

                    if (durationLimit && newEnd > durationLimit) {
                        newEnd = durationLimit;
                        newStart = Math.max(0, newEnd - MIN_REGION_LENGTH);
                    }

                    if (newEnd - newStart < MIN_REGION_LENGTH) {
                        newEnd = newStart + MIN_REGION_LENGTH;
                        if (durationLimit && newEnd > durationLimit) {
                            newEnd = durationLimit;
                            newStart = Math.max(0, newEnd - MIN_REGION_LENGTH);
                        }
                    }

                    if (newEnd - newStart > MAX_REGION_LENGTH) {
                        newEnd = newStart + MAX_REGION_LENGTH;
                        if (durationLimit && newEnd > durationLimit) {
                            newEnd = durationLimit;
                            newStart = Math.max(0, newEnd - MAX_REGION_LENGTH);
                        }
                    }

                    const hasChanged = Math.abs(newStart - region.start) > 0.01 || Math.abs(newEnd - region.end) > 0.01;

                    if (hasChanged) {
                        region.update({ start: newStart, end: newEnd });
                        return;
                    }

                    regionRef.current = region;
                    setInputError(null);
                    setStartTime(newStart);
                    setEndTime(newEnd);
                });

                regions.on('region-clicked', (region, e) => {
                    e.stopPropagation();
                    if (region.id === SELECTION_REGION_ID) {
                        setInputError(null);
                        setStartTime(region.start);
                        setEndTime(region.end);
                        region.play(true);
                    }
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
            regionRef.current = null;
            regionsPluginRef.current = null;
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

    useEffect(() => {
        startTimeRef.current = startTime;
    }, [startTime]);

    useEffect(() => {
        endTimeRef.current = endTime;
    }, [endTime]);

    useEffect(() => {
        setStartInput(formatTime(startTime));
        setEndInput(formatTime(endTime));
    }, [startTime, endTime]);

    const applyManualTimes = (startValue, endValue) => {
        const parsedStart = parseTimeInput(startValue);
        const parsedEnd = parseTimeInput(endValue);

        if (parsedStart === null || parsedEnd === null) {
            setInputError('Используйте формат ММ:СС или введите количество секунд.');
            return;
        }

        if (parsedStart < 0 || parsedEnd < 0) {
            setInputError('Время не может быть отрицательным.');
            return;
        }

        if (parsedEnd <= parsedStart) {
            setInputError('Время окончания должно быть больше времени начала.');
            return;
        }

        const segmentLength = parsedEnd - parsedStart;
        if (segmentLength < MIN_REGION_LENGTH) {
            setInputError(`Минимальная длительность отрезка — ${MIN_REGION_LENGTH} с.`);
            return;
        }

        if (segmentLength > MAX_REGION_LENGTH) {
            setInputError(`Максимальная длительность отрезка — ${MAX_REGION_LENGTH} с.`);
            return;
        }

        const duration = waveSurferRef.current?.getDuration() || 0;
        if (duration) {
            if (parsedStart >= duration) {
                setInputError('Время начала не может превышать длительность аудио.');
                return;
            }
            if (parsedEnd > duration) {
                setInputError('Время окончания не может превышать длительность аудио.');
                return;
            }
        }

        setInputError(null);
        setStartTime(parsedStart);
        setEndTime(parsedEnd);

        if (regionsPluginRef.current && isWaveReady) {
            if (!regionRef.current) {
                regionRef.current = regionsPluginRef.current.addRegion({
                    id: SELECTION_REGION_ID,
                    start: parsedStart,
                    end: parsedEnd,
                    content: 'Выбранный фрагмент',
                    color: 'rgba(59, 130, 246, 0.3)',
                });
            } else {
                regionRef.current.update({ start: parsedStart, end: parsedEnd });
            }
        }
    };

    const handleStartInputChange = (event) => {
        setStartInput(event.target.value);
    };

    const handleEndInputChange = (event) => {
        setEndInput(event.target.value);
    };

    const handleStartInputBlur = (event) => {
        applyManualTimes(event.target.value, endInput);
    };

    const handleEndInputBlur = (event) => {
        applyManualTimes(startInput, event.target.value);
    };

    const handleStartInputKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyManualTimes(event.currentTarget.value, endInput);
        }
    };

    const handleEndInputKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyManualTimes(startInput, event.currentTarget.value);
        }
    };

    const handleCut = async () => {
        const data = {
            user_id: initDataUnsafe?.user?.id || 'unknown',
            start_time: formatTime(startTime),
            end_time: formatTime(endTime),
        };

        console.log("📤 Sending cut audio request to /api/save-segment:", data);
        try {
            const response = await fetch('https://bot.pembrock.ru/api/save-segment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log("📡 Response from /api/save-segment:", result);

            setSuccessMessage("✅ Аудио обработано!");
            setTimeout(() => {
                window.Telegram.WebApp.close();
            }, 1000);

            // Логи на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'cut_audio_post',
                    data,
                    response: result,
                    userId: initDataUnsafe?.user?.id || 'unknown',
                    telegramVersion: window.Telegram?.WebApp?.version,
                    platform: window.Telegram?.WebApp?.platform,
                    telegramInfo,
                    timestamp: new Date().toISOString(),
                }),
            }).catch(err => console.error("⚠️ Vercel log error:", err));
        } catch (err) {
            console.error("⚠️ Error sending cut audio request:", err);
            setError("❌ Ошибка обработки аудио: " + err.message);

            // Логируем ошибку на Vercel
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'cut_audio_post_error',
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
        console.log("📤 Sending test POST to /api/test:", testData);
        try {
            const response = await fetch('https://bot.pembrock.ru/api/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData),
            });
            const result = await response.json();
            console.log("📡 Response from /api/test:", result);

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
            <div className="mb-4 bg-white p-4 rounded shadow">
                <h2 className="text-lg font-semibold mb-3">Ручная регулировка</h2>
                <p className="text-sm text-gray-500 mb-3">
                    Введите значения в формате <strong>мм:сс</strong> или количество секунд. Выбранный участок будет автоматически отмечен на шкале.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col text-left text-sm font-medium text-gray-700">
                        Начало
                        <input
                            type="text"
                            value={startInput}
                            onChange={handleStartInputChange}
                            onBlur={handleStartInputBlur}
                            onKeyDown={handleStartInputKeyDown}
                            placeholder="00:00"
                            autoComplete="off"
                            className="mt-1 rounded border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </label>
                    <label className="flex flex-col text-left text-sm font-medium text-gray-700">
                        Конец
                        <input
                            type="text"
                            value={endInput}
                            onChange={handleEndInputChange}
                            onBlur={handleEndInputBlur}
                            onKeyDown={handleEndInputKeyDown}
                            placeholder="00:30"
                            autoComplete="off"
                            className="mt-1 rounded border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </label>
                </div>
                {inputError && (
                    <p className="mt-3 text-sm text-red-500">{inputError}</p>
                )}
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

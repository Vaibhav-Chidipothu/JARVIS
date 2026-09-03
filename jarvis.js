const CITY = 'Chennai';
const API_URL = '/api/chat';
const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');
const waveform = document.getElementById('waveform');
const logScroll = document.getElementById('logScroll');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const linkStatus = document.querySelector('.status-strip.left');
let listening = false;
let recognition = null;
let startingMic = false;

function tickClock() {
	const now = new Date();
	document.getElementById('clockTime').textContent = now.toLocaleTimeString('en-GB', {
		timeZone: 'Asia/Kolkata', hour12: false
	});
	document.getElementById('clockDate').textContent = now.toLocaleDateString('en-US', {
		timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
	}).toUpperCase();
}

async function loadWeather() {
	try {
		const response = await fetch(`/api/weather?city=${encodeURIComponent(CITY)}`);
		if (!response.ok) throw new Error('Weather request failed');
		const data = await response.json();
		document.getElementById('weatherCity').textContent = data.city.toUpperCase();
		document.getElementById('weatherTemp').textContent = `${data.temperature}°`;
		document.getElementById('weatherDesc').textContent = data.description;
		document.getElementById('weatherFeels').textContent = `${data.feels_like}°`;
		document.getElementById('weatherHumidity').textContent = `${data.humidity}%`;
		document.getElementById('weatherWind').textContent = `${data.wind} km/h`;
		document.getElementById('weatherUpdated').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	} catch (error) {
		document.getElementById('weatherDesc').innerHTML = '<span class="weather-error">UPLINK FAILED</span>';
		console.error(error);
	}
}

function appendMessage(who, text) {
	const row = document.createElement('div');
	row.className = `msg ${who === 'JARVIS' ? 'jarvis' : 'user'}`;
	row.innerHTML = `<span class="who">${who}</span><span class="body"></span>`;
	row.querySelector('.body').textContent = text;
	logScroll.appendChild(row);
	logScroll.scrollTop = logScroll.scrollHeight;
}

function setLinkStatus(text, online) {
	linkStatus.innerHTML = `<span class="dot"></span> LINK: ${text}`;
	linkStatus.classList.toggle('online', online);
}

async function sendMessage(text) {
	appendMessage('YOU', text);
	sendBtn.disabled = true;
	setLinkStatus('TRANSMITTING', true);
	try {
		const response = await fetch(API_URL, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: text })
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || 'Backend request failed');
		appendMessage('JARVIS', data.reply);
		if (listening && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(data.reply));
		setLinkStatus('ONLINE', true);
	} catch (error) {
		appendMessage('JARVIS', `Backend unavailable: ${error.message}`);
		setLinkStatus('OFFLINE', false);
	} finally {
		sendBtn.disabled = false;
	}
}

function handleSend() {
	const text = chatInput.value.trim();
	if (!text || sendBtn.disabled) return;
	chatInput.value = '';
	sendMessage(text);
}

async function setListening(state) {
	if (startingMic || state === listening) return;
	if (state && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
		micStatus.textContent = 'MIC NEEDS HTTPS OR LOCALHOST';
		appendMessage('JARVIS', 'Microphone access requires Chrome or Edge on localhost or HTTPS.');
		return;
	}
	if (state) {
		startingMic = true;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach((track) => track.stop());
		} catch (error) {
			startingMic = false;
			micStatus.textContent = error.name === 'NotAllowedError' ? 'MIC BLOCKED · ALLOW ACCESS' : 'MIC ERROR · TRY AGAIN';
			appendMessage('JARVIS', 'Microphone permission was denied or no microphone was found. Check the browser permission icon.');
			return;
		}
		startingMic = false;
	}
	listening = state;
	micBtn.classList.toggle('listening', state);
	micBtn.setAttribute('aria-pressed', String(state));
	waveform.classList.toggle('active', state);
	micStatus.textContent = state ? 'LISTENING…' : 'MIC OFF · TAP TO SPEAK';
	micStatus.classList.toggle('live', state);
	if (state) {
		if (!recognition) {
			const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (!SpeechRecognition) {
				appendMessage('JARVIS', 'Voice input is not supported in this browser.');
				setListening(false);
				return;
			}
			recognition = new SpeechRecognition();
			recognition.continuous = false;
			recognition.interimResults = false;
			recognition.lang = 'en-US';
			recognition.onresult = (event) => sendMessage(event.results[0][0].transcript);
			recognition.onend = () => { if (listening) setListening(false); };
			recognition.onerror = (event) => {
				const message = event.error === 'not-allowed' ? 'Speech recognition permission was blocked.' : `Voice input error: ${event.error}.`;
				appendMessage('JARVIS', message);
				setListening(false);
			};
		}
		try {
			recognition.start();
		} catch (error) {
			console.error('Could not start speech recognition:', error);
			setListening(false);
		}
	} else if (recognition) {
		recognition.stop();
	}
}

micBtn.addEventListener('click', () => setListening(!listening));
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') handleSend(); });
tickClock();
loadWeather();
setInterval(tickClock, 1000);
setInterval(loadWeather, 10 * 60 * 1000);

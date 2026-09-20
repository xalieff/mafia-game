<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">

<!-- Progressive Web App -->
<meta name="theme-color" content="#121212">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mafia">
<link rel="manifest" href="/manifest.json">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

<title>Mafia</title>
<style>
  /* ───────────────────────────── Tokens ───────────────────────────── */
  :root {
    /* Phase atmospheres (the whole screen shifts with the game phase) */
    --neutral: #141827;
    --night: #0B0E1C;
    --dusk: #241B2E;
    --verdict: #2C1A25;
    --bg: var(--neutral);
    --glow: rgba(240, 196, 90, 0.07);

    --panel: #1B2036;
    --panel-2: #262C48;
    --line: #3A4166;
    --text: #ECEAF4;
    --muted: #A9A7C2;

    --lamp: #F0C45A;      /* primary action: streetlamp amber */
    --lamp-ink: #241A00;
    --mafia: #E0506F;
    --doctor: #4CC7AC;
    --detective: #6EA8F2;
    --town: #D2BE92;

    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }

  body[data-phase="night"]  { --bg: var(--night);   --glow: rgba(110, 168, 242, 0.20); }
  body[data-phase="day"]    { --bg: var(--dusk);    --glow: rgba(240, 196, 90, 0.20); }
  body[data-phase="voting"] { --bg: var(--verdict); --glow: rgba(224, 80, 111, 0.20); }
  body[data-phase="ended"][data-winner="Mafia"] { --bg: var(--verdict); --glow: rgba(224, 80, 111, 0.22); }
  body[data-phase="ended"][data-winner="Town"]  { --bg: #172321;        --glow: rgba(76, 199, 172, 0.20); }

  [data-role="Mafia"]       { --role: var(--mafia); }
  [data-role="Doctor"]      { --role: var(--doctor); }
  [data-role="Detective"]   { --role: var(--detective); }
  [data-role="Townsperson"] { --role: var(--town); }

  /* ───────────────────────────── Base ───────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { color-scheme: dark; -webkit-text-size-adjust: 100%; overscroll-behavior-y: none; }
  button, summary, .lang-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100dvh;
    font: 400 1rem/1.5 var(--sans);
    color: var(--text);
    background:
      radial-gradient(120% 55% at 85% -8%, var(--glow), transparent 62%),
      var(--bg);
    background-color: var(--bg);
    transition: background-color 700ms ease;
  }
  h1, h2, h3 { font-family: var(--serif); font-weight: 700; line-height: 1.15; margin: 0; letter-spacing: -0.01em; }
  h2 { font-size: 1.75rem; }
  h3 { font-size: 1.25rem; }
  p { margin: 0; }
  ul { margin: 0; padding: 0; list-style: none; }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 3px solid var(--lamp); outline-offset: 2px; }

  .app {
    max-width: 560px;
    margin: 0 auto;
    padding: 0 16px calc(32px + env(safe-area-inset-bottom));
  }
  main { display: grid; gap: 16px; padding-top: 16px; }
  /* Installed on iOS, the translucent status bar overlays the page: keep the join screen clear of it.
     (In a room, the sticky top bar already adds the safe-area inset itself.) */
  body[data-phase="none"] main { padding-top: calc(16px + env(safe-area-inset-top)); }
  .screen { display: grid; gap: 16px; }
  #screen-join { padding-top: 28px; }
  .muted { color: var(--muted); }
  .center { text-align: center; }
  .stack { display: grid; gap: 16px; }
  .lede { color: var(--muted); max-width: 46ch; }
  .hint { color: var(--muted); font-size: 0.875rem; }

  /* ───────────────────────────── Language toggle (fixed, every view) ───────────────────────────── */
  .lang-toggle {
    position: fixed; z-index: 20;
    top: calc(10px + env(safe-area-inset-top));
    right: calc(12px + env(safe-area-inset-right));
    display: flex; align-items: center; gap: 2px; padding: 3px;
    border-radius: 999px; background: var(--panel); border: 1px solid var(--line);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }
  .lang-btn {
    min-width: 42px; min-height: 36px; padding: 0 10px; border: 0; border-radius: 999px;
    background: transparent; color: var(--muted); font-weight: 700; letter-spacing: 0.06em; cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
  }
  .lang-btn:hover { color: var(--text); }
  .lang-btn[aria-pressed="true"] { background: var(--lamp); color: var(--lamp-ink); }
  .lang-sep { color: var(--line); user-select: none; }

  /* ───────────────────────────── Top bar ───────────────────────────── */
  .topbar {
    position: sticky; top: 0; z-index: 5;
    display: grid; gap: 6px;
    margin: 0 -16px;
    padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
    background: var(--bg);
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    transition: background-color 700ms ease;
  }
  /* The first row leaves room for the fixed language toggle. */
  .topbar-left { display: flex; align-items: center; gap: 8px; min-height: 42px; padding-right: 124px; }
  .topbar-right { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .topbar-actions { display: flex; gap: 8px; }
  .brand { font: 700 1.25rem var(--serif); }
  .room-chip {
    font: 600 0.875rem var(--mono); letter-spacing: 0.06em;
    padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel);
    overflow-wrap: anywhere;
  }
  .phase-pill {
    display: inline-flex; align-items: baseline; gap: 8px;
    padding: 4px 12px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line);
    font-size: 0.9rem; font-weight: 600;
  }
  .phase-pill time { font-variant-numeric: tabular-nums; color: var(--lamp); }
  .phase-pill time.urgent { color: var(--mafia); }

  .conn {
    position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom)); transform: translateX(-50%);
    z-index: 30; padding: 8px 16px; border-radius: 999px; background: var(--mafia); color: #14060A; font-weight: 600;
    width: max-content; max-width: calc(100vw - 32px); text-align: center;
  }

  /* ───────────────────────────── Cards, buttons, fields ───────────────────────────── */
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 18px; display: grid; gap: 14px; }
  .card > h3 { margin-bottom: -4px; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 8px 20px; border-radius: 12px; line-height: 1.2;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--text);
    font-weight: 600; cursor: pointer; text-align: center;
    transition: background-color 150ms ease, transform 100ms ease;
  }
  .btn:hover:not([disabled]) { background: #303759; }
  .btn:active:not([disabled]) { transform: translateY(1px); }
  .btn[disabled] { opacity: 0.45; cursor: not-allowed; }
  .btn-primary { background: var(--lamp); color: var(--lamp-ink); border-color: transparent; }
  .btn-primary:hover:not([disabled]) { background: #F5D07A; }
  .btn-sm { min-height: 44px; padding: 6px 12px; font-size: 0.95rem; }
  .btn-xs { min-height: 36px; padding: 4px 12px; font-size: 0.85rem; }
  .btn-wide { width: 100%; }
  .btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn-row .btn { padding-left: 12px; padding-right: 12px; }
  .pick { min-width: 100px; }
  .pick[aria-pressed="true"] { background: var(--accent, var(--lamp)); color: #10131F; border-color: transparent; }
  .pick[aria-pressed="true"]:hover:not([disabled]) { background: var(--accent, var(--lamp)); }

  .field { display: grid; gap: 6px; }
  .field label { font-weight: 600; }
  input[type="text"] {
    width: 100%; min-height: 50px; padding: 0 14px; font-size: 1rem;
    background: var(--bg); border: 1px solid var(--line); border-radius: 12px; color: var(--text);
    transition: border-color 150ms ease;
  }
  input[type="text"]::placeholder { color: #6F6D8C; }
  input[type="text"]:focus-visible { outline: none; border-color: var(--lamp); box-shadow: 0 0 0 3px rgba(240, 196, 90, 0.25); }
  input[type="text"][disabled] { opacity: 0.5; }
  #codeInput { font-family: var(--mono); letter-spacing: 0.3em; text-transform: uppercase; }

  /* ───────────────────────────── Join screen ───────────────────────────── */
  .hero { font-size: clamp(3.5rem, 18vw, 5.5rem); letter-spacing: -0.03em; padding-top: 12px; }
  .rules summary { cursor: pointer; font-weight: 600; }
  .rules ul { display: grid; gap: 8px; margin-top: 12px; color: var(--muted); padding-left: 18px; list-style: disc; }
  .rules strong { color: var(--text); }

  /* ───────────────────────────── Lists & rows ───────────────────────────── */
  .list { display: grid; gap: 8px; }
  .row {
    display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 8px 12px;
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px;
  }
  .row.out { opacity: 0.7; }
  .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .row-name { font-weight: 600; overflow-wrap: anywhere; }
  .row-sub { font-size: 0.85rem; color: var(--muted); }
  .row-tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .avatar {
    flex: none; width: 38px; height: 38px; border-radius: 50%;
    display: grid; place-items: center; font: 700 1.05rem var(--serif);
  }
  .tag {
    display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
    border: 1px solid var(--line); color: var(--muted); white-space: nowrap;
  }
  .tag.host { color: var(--lamp); border-color: rgba(240, 196, 90, 0.5); }
  .tag.danger { color: var(--mafia); border-color: rgba(224, 80, 111, 0.55); }
  .tag.ok { color: var(--doctor); border-color: rgba(76, 199, 172, 0.55); }
  .tag.votes { color: var(--lamp); border-color: rgba(240, 196, 90, 0.5); }
  .tag[data-role] { color: var(--role); border-color: var(--role); }

  /* ───────────────────────────── Lobby ───────────────────────────── */
  .code {
    font: 700 clamp(3rem, 16vw, 4.5rem)/1 var(--serif); letter-spacing: 0.14em;
    padding-left: 0.14em; /* optically balances trailing letter-spacing */
    color: var(--lamp); text-align: center; user-select: all;
  }

  /* ───────────────────────────── Role settings ───────────────────────────── */
  .role-row {
    display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 8px 12px;
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px;
  }
  .role-swatch { flex: none; width: 8px; height: 34px; border-radius: 6px; background: var(--role, var(--line)); }
  .role-name { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
  .stepper { display: flex; align-items: center; gap: 4px; }
  .stepper-btn { width: 44px; min-height: 44px; height: 44px; padding: 0; font-size: 1.4rem; line-height: 1; border-radius: 12px; }
  .stepper-value { min-width: 2.4ch; text-align: center; font: 700 1.3rem var(--serif); font-variant-numeric: tabular-nums; }
  .role-count { min-width: 2.4ch; text-align: center; font: 700 1.5rem var(--serif); color: var(--role, var(--text)); font-variant-numeric: tabular-nums; }
  .role-total {
    text-align: center; font-weight: 600; padding: 10px 12px; border-radius: 12px;
    background: var(--bg); border: 1px solid var(--line); overflow-wrap: anywhere;
  }
  .role-total.ok { color: var(--doctor); border-color: rgba(76, 199, 172, 0.55); }
  .role-total.bad { color: var(--mafia); border-color: rgba(224, 80, 111, 0.55); }
  .role-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .start-error { color: var(--mafia); font-weight: 600; }

  /* ───────────────────────────── Role card ───────────────────────────── */
  .screen-title { font-size: 1.75rem; }
  .role-stage { display: grid; place-items: center; perspective: 1200px; padding: 6px 0 4px; }
  .role-card {
    position: relative; width: min(84vw, 320px); aspect-ratio: 5 / 7;
    transform-style: preserve-3d; transition: transform 650ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .role-card.revealed { transform: rotateY(180deg); }
  .face {
    position: absolute; inset: 0; border-radius: 22px; padding: 20px;
    -webkit-backface-visibility: hidden; backface-visibility: hidden;
    display: flex; flex-direction: column; gap: 12px; overflow: auto;
  }
  .face.back {
    align-items: center; justify-content: center; text-align: center;
    background: repeating-linear-gradient(135deg, #1E2442 0 12px, #252C50 12px 24px);
    border: 2px solid var(--line);
  }
  .face.back .mark { font: 700 4.5rem/1 var(--serif); color: var(--lamp); }
  .face.front { transform: rotateY(180deg); background: var(--panel); border: 2px solid var(--role, var(--line)); }
  .face.front h3 { font-size: clamp(1.6rem, 7vw, 2rem); color: var(--role, var(--text)); overflow-wrap: anywhere; }
  .face.front p { font-size: 0.95rem; }
  .face.front .goal { font-size: 0.875rem; color: var(--muted); border-top: 1px solid var(--line); padding-top: 10px; margin-top: auto; }
  .team { display: grid; gap: 6px; }
  .team .row { min-height: 42px; padding: 4px 10px; }

  /* ───────────────────────────── Night ───────────────────────────── */
  .hero-card { text-align: center; justify-items: center; padding: 26px 18px; }
  .moon { width: 64px; height: 64px; color: var(--detective); }
  body[data-phase="day"] .moon, body[data-phase="voting"] .moon { display: none; }
  .status { font-size: 0.95rem; color: var(--lamp); min-height: 1.4em; }

  /* ───────────────────────────── Day / vote ───────────────────────────── */
  .announce { border-left: 5px solid var(--lamp); }
  .announce.deadly { border-left-color: var(--mafia); }
  .announce p { font-size: 1.1rem; }

  /* ───────────────────────────── Game over ───────────────────────────── */
  .verdict { text-align: center; padding: 26px 18px; }
  .verdict[data-winner="Mafia"] h2 { color: var(--mafia); }
  .verdict[data-winner="Town"] h2 { color: var(--doctor); }
  .verdict h2 { font-size: 2.2rem; }

  /* ───────────────────────────── Banner, notes, chat ───────────────────────────── */
  .dead-banner {
    display: grid; gap: 2px; padding: 12px 16px; border-radius: 14px;
    background: rgba(224, 80, 111, 0.14); border: 1px solid rgba(224, 80, 111, 0.55);
  }
  .dead-banner strong { color: var(--mafia); font-family: var(--serif); font-size: 1.15rem; }
  .notes li { padding: 8px 12px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--line); overflow-wrap: anywhere; }
  .notes .bad { color: var(--mafia); font-weight: 600; }
  .notes .good { color: var(--town); font-weight: 600; }

  .chat-log {
    display: grid; gap: 6px; align-content: start; max-height: 240px; overflow-y: auto;
    padding: 10px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); min-height: 64px;
  }
  .msg { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; overflow-wrap: anywhere; }
  .msg-name { font-weight: 700; color: var(--lamp); }
  .msg.mine .msg-name { color: var(--detective); }
  .msg.mafia .msg-name { color: var(--mafia); }
  .msg.dead { color: var(--muted); font-style: italic; }
  .msg-empty { color: var(--muted); font-size: 0.9rem; }
  .chat-form { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .chat-channel { font-size: 0.875rem; color: var(--muted); }

  /* ───────────────────────────── Toasts & modal ───────────────────────────── */
  .toasts {
    position: fixed; z-index: 40; left: 0; right: 0; top: calc(60px + env(safe-area-inset-top));
    display: grid; gap: 8px; justify-items: center; padding: 0 16px; pointer-events: none;
  }
  .toast {
    pointer-events: auto; max-width: 520px; width: 100%; padding: 12px 16px; border-radius: 12px;
    background: var(--panel-2); border: 1px solid var(--line); border-left-width: 5px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    animation: toast-in 180ms ease-out; overflow-wrap: anywhere;
  }
  .toast.error { border-left-color: var(--mafia); }
  .toast.ok { border-left-color: var(--doctor); }
  .toast.info { border-left-color: var(--detective); }
  @keyframes toast-in { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }

  dialog.modal {
    width: min(92vw, 420px); padding: 0; border: 1px solid var(--line); border-radius: 20px;
    background: var(--panel); color: var(--text);
  }
  dialog.modal::backdrop { background: rgba(4, 5, 12, 0.72); }
  .modal-body { display: grid; gap: 14px; padding: 22px; }
  .modal-body h2 { font-size: 1.5rem; }
  .modal[data-tone="mafia"] h2 { color: var(--mafia); }
  .modal[data-tone="town"] h2 { color: var(--doctor); }
  .modal-big { font: 700 1.8rem/1.2 var(--serif); overflow-wrap: anywhere; }
  .modal-big.mafia { color: var(--mafia); }
  .modal-big.town { color: var(--town); }
  .vote-line { padding: 6px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .vote-line:last-child { border-bottom: 0; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
  @media (max-width: 380px) {
    .btn-row { grid-template-columns: 1fr; }
    .pick { min-width: 92px; }
  }
</style>
</head>
<body data-phase="none">
<noscript><p style="padding:24px">This game needs JavaScript to run. / Для игры нужен JavaScript.</p></noscript>

<!-- Language toggle: fixed in the top corner on every screen -->
<div class="lang-toggle" id="langToggle" role="group" aria-label="Language" data-i18n-aria="lang.label">
  <button type="button" class="lang-btn" data-lang="en" lang="en" aria-label="English" aria-pressed="true">EN</button>
  <span class="lang-sep" aria-hidden="true">|</span>
  <button type="button" class="lang-btn" data-lang="ru" lang="ru" aria-label="Русский" aria-pressed="false">RU</button>
</div>

<div class="app">
  <!-- Top bar (only while in a room) -->
  <header class="topbar" id="topbar" hidden>
    <div class="topbar-left">
      <span class="brand" data-i18n="app.title">Mafia</span>
      <span class="room-chip" id="roomChip"></span>
    </div>
    <div class="topbar-right">
      <div class="phase-pill"><span id="phaseLabel"></span><time id="phaseTimer" hidden></time></div>
      <div class="topbar-actions">
        <button class="btn btn-xs" id="roleBtn" type="button" hidden>My Role</button>
        <button class="btn btn-xs" id="leaveBtn" type="button" data-i18n="btn.leave">Leave</button>
      </div>
    </div>
  </header>

  <main>
    <div class="dead-banner" id="deadBanner" role="status" hidden>
      <strong data-i18n="dead.title">You are dead. Spectating.</strong>
      <span class="muted" data-i18n="dead.text">You can watch and chat with other dead players, but you can't act or vote.</span>
    </div>

    <!-- Screen 1: Join / Create -->
    <section class="screen" id="screen-join" aria-labelledby="joinTitle">
      <h1 class="hero" id="joinTitle" data-i18n="app.title">Mafia</h1>
      <p class="lede" data-i18n="join.lede">A party game of secret roles and quiet suspicion. Everyone plays from their own phone, and nobody needs an account.</p>
      <form class="card" id="joinForm" autocomplete="off" novalidate>
        <div class="field">
          <label for="nameInput" data-i18n="join.nickname">Nickname</label>
          <input type="text" id="nameInput" maxlength="16" autocomplete="nickname" autocapitalize="words" spellcheck="false" placeholder="What should we call you?" data-i18n-placeholder="join.nicknamePh">
        </div>
        <div class="field">
          <label for="codeInput" data-i18n="join.code">Room code</label>
          <input type="text" id="codeInput" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-describedby="codeHint">
          <p class="hint" id="codeHint"></p>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" type="button" id="createBtn" data-i18n="join.create">Create Room</button>
          <button class="btn" type="button" id="joinBtn" data-i18n="join.join">Join Room</button>
        </div>
      </form>
      <details class="card rules">
        <summary data-i18n="rules.title">How to play</summary>
        <ul>
          <li data-i18n-rich="rules.1"></li>
          <li data-i18n-rich="rules.2"></li>
          <li data-i18n-rich="rules.3"></li>
          <li data-i18n-rich="rules.4"></li>
        </ul>
      </details>
    </section>

    <!-- Screen 2: Lobby -->
    <section class="screen" id="screen-lobby" aria-label="Lobby" data-i18n-aria="aria.lobby" hidden>
      <div class="card center">
        <div class="code" id="lobbyCode" role="text"></div>
        <p class="muted" data-i18n="lobby.share">Share this room code, or send the invite link.</p>
        <button class="btn" type="button" id="copyLinkBtn" data-i18n="lobby.copy">Copy Invite Link</button>
      </div>
      <div class="card">
        <h3 id="lobbyCount"></h3>
        <ul class="list" id="lobbyList"></ul>
      </div>
      <div class="card" id="roleSettings">
        <h3 data-i18n="roles.title">Role Settings</h3>
        <p class="muted" id="roleIntro"></p>
        <ul class="list" id="roleList"></ul>
        <p class="role-total" id="roleTotal" role="status"></p>
        <div class="role-foot">
          <p class="hint" id="roleMode"></p>
          <button class="btn btn-xs" type="button" id="roleAutoBtn" data-i18n="roles.auto" hidden>Auto-Balance</button>
        </div>
      </div>
      <div id="hostControls" class="stack" hidden>
        <button class="btn btn-primary btn-wide" type="button" id="startBtn" data-i18n="lobby.start">Start Game</button>
        <p class="hint center" id="startHint" role="status"></p>
      </div>
      <p class="muted center" id="guestWait" data-i18n="lobby.guestWait" hidden>Waiting for the host to start the game.</p>
    </section>

    <!-- Screen 3: Role card -->
    <section class="screen" id="screen-role" aria-label="Your role" data-i18n-aria="aria.role" hidden>
      <h2 class="screen-title" data-i18n="role.title">Your role</h2>
      <p class="lede" data-i18n="role.lede">Only you should see this. Anyone nearby can read your screen, so hide your role when you're done.</p>
      <div class="role-stage">
        <div class="role-card" id="roleCard" data-role="">
          <div class="face back" id="roleBack">
            <span class="mark" aria-hidden="true">?</span>
            <p class="muted" data-i18n="role.hidden">Role hidden</p>
          </div>
          <div class="face front" id="roleFront" aria-hidden="true">
            <h3 id="roleName"></h3>
            <p id="roleDesc"></p>
            <div class="team" id="roleTeam" hidden></div>
            <p class="goal" id="roleGoal"></p>
          </div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" id="toggleRoleBtn">Show Role</button>
        <button class="btn" type="button" id="roleContinueBtn" data-i18n="role.continue">Continue</button>
      </div>
    </section>

    <!-- Screen 4: Night -->
    <section class="screen" id="screen-night" aria-label="Night phase" data-i18n-aria="aria.night" hidden>
      <div class="card hero-card">
        <svg class="moon" viewBox="0 0 64 64" aria-hidden="true">
          <defs><mask id="moonMask"><rect width="64" height="64" fill="#fff"/><circle cx="43" cy="26" r="20" fill="#000"/></mask></defs>
          <circle cx="30" cy="33" r="22" fill="currentColor" mask="url(#moonMask)"/>
        </svg>
        <h2 id="nightTitle"></h2>
        <p class="muted" id="nightText"></p>
      </div>
      <div class="card" id="nightActions" hidden>
        <h3 id="nightHeading"></h3>
        <p class="muted" id="nightHelp"></p>
        <ul class="list" id="nightList"></ul>
        <p class="status" id="nightStatus" role="status"></p>
      </div>
    </section>

    <!-- Screen 5: Day / Voting -->
    <section class="screen" id="screen-day" aria-label="Day phase" data-i18n-aria="aria.day" hidden>
      <div class="card announce" id="dayAnnounce">
        <h2 id="dayTitle"></h2>
        <p id="dayText" aria-live="polite"></p>
      </div>
      <div class="card">
        <h3 id="dayHeading"></h3>
        <p class="muted" id="dayStatus"></p>
        <ul class="list" id="voteList"></ul>
        <button class="btn btn-wide pick" type="button" id="skipVoteBtn" style="--accent: var(--detective)"></button>
        <button class="btn btn-primary btn-wide" type="button" id="advanceBtn" data-i18n="day.advance" hidden>Start Voting Now</button>
      </div>
      <div class="card" id="outCard" hidden>
        <h3 data-i18n="out.title">Out of the game</h3>
        <ul class="list" id="outList"></ul>
      </div>
    </section>

    <!-- Screen 6: Game over -->
    <section class="screen" id="screen-over" aria-label="Game over" data-i18n-aria="aria.over" hidden>
      <div class="card verdict" id="verdict" data-winner="">
        <h2 id="overTitle"></h2>
        <p id="overText"></p>
        <p class="muted" id="overYou"></p>
      </div>
      <div class="card">
        <h3 data-i18n="over.final">Final roles</h3>
        <ul class="list" id="overList"></ul>
      </div>
      <button class="btn btn-primary btn-wide" type="button" id="returnBtn" data-i18n="over.return">Return to Lobby</button>
      <p class="hint center" id="returnHint" data-i18n="over.returnHint" hidden>Only the host can return everyone to the lobby.</p>
    </section>

    <!-- Detective notes (shared across night/day) -->
    <section class="card notes" id="notes" hidden>
      <h3 data-i18n="notes.title">Investigation notes</h3>
      <ul class="list" id="notesList"></ul>
    </section>

    <!-- Chat (shared) -->
    <section class="card" id="chat" aria-label="Chat" data-i18n-aria="chat.title" hidden>
      <h3 data-i18n="chat.title">Chat</h3>
      <p class="chat-channel" id="chatChannel"></p>
      <ul class="chat-log" id="chatLog" aria-live="polite"></ul>
      <form class="chat-form" id="chatForm" autocomplete="off">
        <input type="text" id="chatInput" maxlength="300" placeholder="Type a message" data-i18n-placeholder="chat.placeholder" aria-label="Chat message" data-i18n-aria="chat.aria">
        <button class="btn btn-sm" type="submit" id="chatSend" data-i18n="chat.send">Send</button>
      </form>
    </section>
  </main>
</div>

<div class="toasts" id="toasts" aria-live="polite"></div>
<div class="conn" id="conn" role="status" data-i18n="conn.lost" hidden>Connection lost. Reconnecting...</div>

<dialog class="modal" id="modal" aria-labelledby="modalTitle">
  <div class="modal-body">
    <h2 id="modalTitle"></h2>
    <div id="modalBody" class="stack"></div>
    <button class="btn btn-primary btn-wide" type="button" id="modalOk">OK</button>
  </div>
</dialog>

<script src="/socket.io/socket.io.js"></script>
<script>
(() => {
  'use strict';

  /* The Socket.io client script is deliberately never cached by the service worker.
     If the installed app is opened offline, it is missing: explain that and retry when back online. */
  if (typeof io === 'undefined') {
    let savedLang = '';
    try { savedLang = localStorage.getItem('mafia.lang') || ''; } catch { /* storage blocked */ }
    const banner = document.getElementById('conn');
    if (banner) {
      banner.textContent = savedLang === 'ru'
        ? 'Нет соединения. Подключитесь к интернету, чтобы играть.'
        : 'You are offline. Connect to the internet to play.';
      banner.hidden = false;
    }
    window.addEventListener('online', () => location.reload());
    return;
  }

  /* ══════════════════════════════════════════════════════════════════════
     Translations
     ─ Keys with an object value are plural forms (see tp()).
     ─ `**bold**` inside a string is rendered as <strong> (see richInto()).
     ─ `srv.*` keys exist only in Russian: the server always sends English
       error strings, which are matched and translated in translateServerError().
     ══════════════════════════════════════════════════════════════════════ */

  const I18N = {
    en: {
      'app.title': 'Mafia',
      'lang.label': 'Language',
      'conn.lost': 'Connection lost. Reconnecting...',
      'modal.ok': 'OK',

      'aria.lobby': 'Lobby',
      'aria.role': 'Your role',
      'aria.night': 'Night phase',
      'aria.day': 'Day phase',
      'aria.over': 'Game over',

      'join.lede': 'A party game of secret roles and quiet suspicion. Everyone plays from their own phone, and nobody needs an account.',
      'join.nickname': 'Nickname',
      'join.nicknamePh': 'What should we call you?',
      'join.code': 'Room code',
      'join.create': 'Create Room',
      'join.join': 'Join Room',
      'hint.default': 'Joining a friend? Enter their 4-character code. Creating? Leave it empty for a random code, or choose your own.',
      'hint.noRoom': 'No room has this code yet. Create Room will open one with it.',
      'hint.open': 'Room {code} is open with {players}.',
      'hint.closed': 'That game has already started or is full.',
      'rules.title': 'How to play',
      'rules.1': 'Needs **4 to 15 players**. Everyone gets a secret role.',
      'rules.2': '**Mafia** pick someone to eliminate each night. **Doctor** protects one person. **Detective** checks whether someone is Mafia.',
      'rules.3': 'Each morning, the town learns who died, talks it through, then votes someone out.',
      'rules.4': '**Town wins** when all the Mafia are gone. **Mafia wins** when they equal or outnumber the Town.',

      'plural.players': { one: '{n} player', other: '{n} players' },
      'plural.votes': { one: '{n} vote', other: '{n} votes' },

      'tag.host': 'Host',
      'tag.you': 'You',
      'tag.offline': 'Offline',

      'lobby.share': 'Share this room code, or send the invite link.',
      'lobby.copy': 'Copy Invite Link',
      'lobby.count': 'Players ({n} of {max})',
      'lobby.start': 'Start Game',
      'lobby.guestWait': 'Waiting for the host to start the game.',
      'lobby.hintWaiting': 'Waiting for players... Need at least {min} to start. Connected: {n}.',
      'lobby.hintReady': 'Connected: {n}. Start when everyone is in.',
      'lobby.remove': 'Remove',
      'lobby.removeAria': 'Remove {name}',

      'roles.title': 'Role Settings',
      'roles.hostIntro': 'Choose exactly how many of each role to deal. The roles are shuffled at random when the game starts.',
      'roles.guestIntro': 'The host chooses the roles. Changes appear here live.',
      'roles.total': 'Total Roles Set: {roles} / Total Players in Lobby: {players}',
      'roles.auto': 'Auto-Balance',
      'roles.modeAuto': 'Balanced automatically for the number of players.',
      'roles.modeCustom': 'Custom setup chosen by the host.',
      'roles.dec': 'Decrease {role}',
      'roles.inc': 'Increase {role}',
      'roles.err.mismatch': 'Role count must match total players in room!',
      'roles.err.noMafia': 'At least one Mafia is required to start.',
      'roles.err.mafiaMajority': 'Mafia must be outnumbered by the other roles, or the game would end at once.',

      'room.chip': 'Room {code}',
      'phase.lobby': 'Lobby',
      'phase.night': 'Night {n}',
      'phase.day': 'Day {n}',
      'phase.voting': 'Vote, day {n}',
      'phase.ended': 'Game over',
      'btn.role': 'My Role',
      'btn.backToGame': 'Back to Game',
      'btn.leave': 'Leave',

      'role.title': 'Your role',
      'role.lede': "Only you should see this. Anyone nearby can read your screen, so hide your role when you're done.",
      'role.hidden': 'Role hidden',
      'role.show': 'Show Role',
      'role.hide': 'Hide Role',
      'role.continue': 'Continue',
      'role.partner': 'Your partner',
      'role.partners': 'Your partners',
      'role.Mafia': 'Mafia',
      'role.Doctor': 'Doctor',
      'role.Detective': 'Detective',
      'role.Townsperson': 'Townsperson',
      'role.desc.Mafia': 'Each night, you and your team choose one person to eliminate. By day, blend in and stay out of suspicion.',
      'role.desc.Doctor': 'Each night, choose one person to protect. If the Mafia target them, they survive. You may protect yourself.',
      'role.desc.Detective': 'Each night, investigate one person to learn whether they are Mafia. Use what you learn carefully.',
      'role.desc.Townsperson': 'You have no night power. Watch, listen, and use your vote to find the Mafia.',
      'role.goal.Mafia': 'You win when the Mafia equal or outnumber the Town.',
      'role.goal.Town': 'You win when every Mafia member is eliminated.',

      'night.title': 'Night {n}',
      'night.text': 'Night has fallen. The town is asleep. Make your move before dawn.',
      'night.sleepTitle': 'Sleeping...',
      'night.sleepText': 'Night has fallen. You have no night power. Stay quiet until morning.',
      'night.specTitle': 'Spectating',
      'night.specTextAct': 'Night has fallen. You can no longer act, but you can watch the night pass.',
      'night.specText': 'Night has fallen. You are out of the game. Watch the night pass.',
      'night.mates': ' Fellow Mafia: {names}.',
      'night.pickYours': 'Your pick',
      'night.pickOf': "{name}'s pick",
      'night.killed': 'Dawn breaks. {name} was killed by the Mafia during the night. They were the {role}.',
      'night.peaceful': 'Dawn breaks and, remarkably, no one died last night.',

      'act.Mafia.heading': 'Choose someone to eliminate',
      'act.Mafia.help': 'Your team decides by most picks. If you split, one of the top picks is chosen at random.',
      'act.Mafia.verb': 'Eliminate',
      'act.Mafia.done': 'Targeted',
      'act.Doctor.heading': 'Choose someone to protect',
      'act.Doctor.help': 'If the Mafia target your patient, they survive the night. You may protect yourself.',
      'act.Doctor.verb': 'Protect',
      'act.Doctor.done': 'Protected',
      'act.Detective.heading': 'Choose someone to investigate',
      'act.Detective.help': 'You learn whether they are Mafia. You can investigate one person each night.',
      'act.Detective.verb': 'Investigate',
      'act.Detective.done': 'Investigated',

      'status.dead': "You are dead, so you can't act.",
      'status.locked': 'You investigated {name}. Wait for dawn.',
      'status.chose': 'You chose {name}.',
      'status.change': ' You can change your choice until dawn.',
      'status.pick': 'Pick someone before dawn.',

      'day.title': 'Day {n}',
      'day.discussion': 'Discussion',
      'day.whoMafia': 'Who is the Mafia?',
      'day.statusVoting': '{voted} of {total} votes cast. You can change your vote until everyone has voted.',
      'day.statusDiscussion': 'Talk it through. Voting opens when the timer ends or the host starts it.',
      'day.advance': 'Start Voting Now',
      'vote.cast': 'Vote',
      'vote.voted': 'Voted',
      'vote.skip': 'Skip Vote',
      'vote.for': ' voted for ',
      'vote.skipped': ' skipped the vote',
      'out.title': 'Out of the game',
      'cause.mafia': 'Killed by the Mafia',
      'cause.vote': 'Voted out by the town',
      'cause.left': 'Left the game',
      'cause.survived': 'Survived',

      'voteRes.eliminated': 'The town has spoken',
      'voteRes.none': 'No one was eliminated',
      'voteRes.majority': '{name} was voted out by the town. They were the {role}.',
      'voteRes.tie': 'The vote ended in a tie. No one was eliminated.',
      'voteRes.skip': 'The town chose not to eliminate anyone.',
      'voteRes.noVotes': 'No votes were cast. No one was eliminated.',

      'elim.title': 'You have been eliminated',
      'elim.mafia': 'The Mafia killed you during the night.',
      'elim.vote': 'The town voted you out.',
      'elim.default': 'You are out of the game.',
      'elim.note': 'You can keep watching and chat with other dead players.',
      'elim.keep': 'Keep Watching',

      'inv.title': 'Investigation result',
      'inv.mafia': '{name} is Mafia',
      'inv.town': '{name} is Town',
      'inv.subMafia': 'Choose who you tell, and when.',
      'inv.subTown': 'They are not Mafia.',
      'notes.title': 'Investigation notes',
      'notes.prefix': 'Night {n}: {name} is ',
      'res.mafia': 'Mafia',
      'res.town': 'Town',

      'over.mafiaWins': 'The Mafia wins',
      'over.townWins': 'The Town wins',
      'over.textMafia': 'The Mafia now outnumber or equal the Town. The Mafia wins!',
      'over.textTown': 'All the Mafia have been eliminated. The Town wins!',
      'over.youWon': 'You were the {role}. Your side won.',
      'over.youLost': 'You were the {role}. Your side lost.',
      'over.final': 'Final roles',
      'over.return': 'Return to Lobby',
      'over.returnHint': 'Only the host can return everyone to the lobby.',

      'dead.title': 'You are dead. Spectating.',
      'dead.text': "You can watch and chat with other dead players, but you can't act or vote.",

      'chat.title': 'Chat',
      'chat.placeholder': 'Type a message',
      'chat.aria': 'Chat message',
      'chat.send': 'Send',
      'chat.empty': 'No messages yet.',
      'chat.room': 'Everyone in the room can read this.',
      'chat.mafia': 'Mafia chat. Only your team can read this.',
      'chat.town': 'Town chat. Everyone can read this.',
      'chat.dead': 'Dead chat. Only eliminated players can read this.',

      'err.notConnected': 'Not connected to the server yet. Trying to reconnect...',
      'err.timeout': 'The server took too long to respond. Try again.',
      'err.generic': 'Something went wrong.',
      'err.nickname': 'Enter a nickname between {min} and {max} characters.',
      'err.codeFormat': 'Room codes are exactly 4 letters or digits.',
      'err.codeNeeded': 'Enter the 4-character room code to join.',
      'err.needPlayers': 'Need at least {min} players to start ({n} connected).',
      'toast.linkCopied': 'Invite link copied.',
      'toast.copyManual': 'Copy this link: {url}',
      'toast.rejoinFail': "Couldn't rejoin your game.",
      'toast.rejoinFailWhy': "Couldn't rejoin your game: {reason}",
      'toast.kicked': 'The host removed you from the room.',
      'toast.replaced': 'This game was opened in another tab, so this tab was disconnected from it.',
      'confirm.leave': 'Leaving now forfeits the game and eliminates you. Leave anyway?',
    },

    ru: {
      'app.title': 'Мафия',
      'lang.label': 'Язык',
      'conn.lost': 'Соединение потеряно. Переподключаемся...',
      'modal.ok': 'OK',

      'aria.lobby': 'Лобби',
      'aria.role': 'Ваша роль',
      'aria.night': 'Ночная фаза',
      'aria.day': 'Дневная фаза',
      'aria.over': 'Игра окончена',

      'join.lede': 'Игра для компании: тайные роли, подозрения и тихие интриги. Каждый играет со своего телефона, регистрация не нужна.',
      'join.nickname': 'Никнейм',
      'join.nicknamePh': 'Как вас называть?',
      'join.code': 'Код комнаты',
      'join.create': 'Создать комнату',
      'join.join': 'Войти в комнату',
      'hint.default': 'Заходите к друзьям? Введите их код из 4 символов. Создаёте комнату? Оставьте поле пустым для случайного кода или придумайте свой.',
      'hint.noRoom': 'Комнаты с таким кодом пока нет. Кнопка «Создать комнату» откроет комнату с этим кодом.',
      'hint.open': 'Комната {code} открыта: {players}.',
      'hint.closed': 'Игра уже началась или комната заполнена.',
      'rules.title': 'Как играть',
      'rules.1': 'Нужно **от 4 до 15 игроков**. Каждому достаётся тайная роль.',
      'rules.2': '**Мафия** каждую ночь выбирает жертву. **Доктор** защищает одного игрока. **Детектив** проверяет, мафия ли игрок.',
      'rules.3': 'Каждое утро город узнаёт, кто погиб, обсуждает случившееся и голосованием исключает подозреваемого.',
      'rules.4': '**Мирные жители побеждают**, когда вся мафия устранена. **Мафия побеждает**, когда её не меньше, чем мирных жителей.',

      'plural.players': { one: '{n} игрок', few: '{n} игрока', many: '{n} игроков', other: '{n} игрока' },
      'plural.votes': { one: '{n} голос', few: '{n} голоса', many: '{n} голосов', other: '{n} голоса' },

      'tag.host': 'Хост',
      'tag.you': 'Вы',
      'tag.offline': 'Не в сети',

      'lobby.share': 'Поделитесь кодом комнаты или отправьте ссылку-приглашение.',
      'lobby.copy': 'Скопировать ссылку',
      'lobby.count': 'Игроки ({n} из {max})',
      'lobby.start': 'Начать игру',
      'lobby.guestWait': 'Ждём, пока хост начнёт игру.',
      'lobby.hintWaiting': 'Ждём игроков... Для старта нужно не меньше {min}. Подключено: {n}.',
      'lobby.hintReady': 'Подключено: {n}. Начинайте, когда все будут на месте.',
      'lobby.remove': 'Убрать',
      'lobby.removeAria': 'Убрать игрока {name}',

      'roles.title': 'Настройка ролей',
      'roles.hostIntro': 'Задайте, сколько карт каждой роли раздать. При старте роли перемешиваются случайным образом.',
      'roles.guestIntro': 'Роли выбирает хост. Изменения появляются здесь сразу.',
      'roles.total': 'Всего ролей: {roles} / Игроков в лобби: {players}',
      'roles.auto': 'Авто-баланс',
      'roles.modeAuto': 'Роли подобраны автоматически под число игроков.',
      'roles.modeCustom': 'Настройка задана хостом вручную.',
      'roles.dec': 'Уменьшить: {role}',
      'roles.inc': 'Увеличить: {role}',
      'roles.err.mismatch': 'Число ролей должно совпадать с числом игроков в комнате!',
      'roles.err.noMafia': 'Для старта нужна хотя бы одна Мафия.',
      'roles.err.mafiaMajority': 'Мафии должно быть меньше, чем остальных ролей, иначе игра закончится сразу.',

      'room.chip': 'Комната {code}',
      'phase.lobby': 'Лобби',
      'phase.night': 'Ночь {n}',
      'phase.day': 'День {n}',
      'phase.voting': 'Голосование, день {n}',
      'phase.ended': 'Игра окончена',
      'btn.role': 'Моя роль',
      'btn.backToGame': 'Назад в игру',
      'btn.leave': 'Выйти',

      'role.title': 'Ваша роль',
      'role.lede': 'Это должны видеть только вы. Соседи могут заглянуть в ваш экран, поэтому скройте роль, когда закончите.',
      'role.hidden': 'Роль скрыта',
      'role.show': 'Показать роль',
      'role.hide': 'Скрыть роль',
      'role.continue': 'Продолжить',
      'role.partner': 'Ваш напарник',
      'role.partners': 'Ваши напарники',
      'role.Mafia': 'Мафия',
      'role.Doctor': 'Доктор',
      'role.Detective': 'Детектив',
      'role.Townsperson': 'Мирный житель',
      'role.desc.Mafia': 'Каждую ночь вы вместе с командой выбираете, кого убрать. Днём держитесь как все и не вызывайте подозрений.',
      'role.desc.Doctor': 'Каждую ночь выбирайте, кого защитить. Если мафия нацелится на этого игрока, он выживет. Можно защитить и себя.',
      'role.desc.Detective': 'Каждую ночь проверяйте одного игрока и узнавайте, мафия он или нет. Распоряжайтесь этой информацией осторожно.',
      'role.desc.Townsperson': 'У вас нет ночных способностей. Наблюдайте, слушайте и голосуйте, чтобы вычислить мафию.',
      'role.goal.Mafia': 'Вы побеждаете, когда мафии становится не меньше, чем мирных жителей.',
      'role.goal.Town': 'Вы побеждаете, когда вся мафия устранена.',

      'night.title': 'Ночь {n}',
      'night.text': 'Наступила ночь. Город спит. Сделайте свой ход до рассвета.',
      'night.sleepTitle': 'Вы спите...',
      'night.sleepText': 'Наступила ночь. У вас нет ночных способностей. Молчите до утра.',
      'night.specTitle': 'Вы наблюдаете',
      'night.specTextAct': 'Наступила ночь. Вы больше не можете действовать, но можете наблюдать за ночью.',
      'night.specText': 'Наступила ночь. Вы выбыли из игры. Наблюдайте за ночью.',
      'night.mates': ' Ваши напарники: {names}.',
      'night.pickYours': 'Ваш выбор',
      'night.pickOf': 'Выбор: {name}',
      'night.killed': 'Наступает утро. Этой ночью мафия убила игрока {name}. Роль: {role}.',
      'night.peaceful': 'Наступает утро, и, как ни странно, этой ночью никто не погиб.',

      'act.Mafia.heading': 'Выберите жертву',
      'act.Mafia.help': 'Команда решает большинством выборов. При ничьей цель выбирается случайно среди лидеров.',
      'act.Mafia.verb': 'Убить',
      'act.Mafia.done': 'Выбран',
      'act.Doctor.heading': 'Выберите, кого защитить',
      'act.Doctor.help': 'Если мафия нацелится на вашего пациента, он переживёт ночь. Можно защитить себя.',
      'act.Doctor.verb': 'Защитить',
      'act.Doctor.done': 'Защищён',
      'act.Detective.heading': 'Выберите, кого проверить',
      'act.Detective.help': 'Вы узнаете, мафия ли этот игрок. За ночь можно проверить только одного.',
      'act.Detective.verb': 'Проверить',
      'act.Detective.done': 'Проверен',

      'status.dead': 'Вы выбыли и не можете действовать.',
      'status.locked': 'Вы проверили игрока {name}. Ждите рассвета.',
      'status.chose': 'Вы выбрали: {name}.',
      'status.change': ' Выбор можно изменить до рассвета.',
      'status.pick': 'Сделайте выбор до рассвета.',

      'day.title': 'День {n}',
      'day.discussion': 'Обсуждение',
      'day.whoMafia': 'Кто из вас мафия?',
      'day.statusVoting': 'Проголосовали: {voted} из {total}. Голос можно изменить, пока не проголосуют все.',
      'day.statusDiscussion': 'Обсудите случившееся. Голосование начнётся по таймеру или когда его запустит хост.',
      'day.advance': 'Начать голосование',
      'vote.cast': 'Голосовать',
      'vote.voted': 'Голос отдан',
      'vote.skip': 'Пропустить голосование',
      'vote.for': ' — за ',
      'vote.skipped': ' — пропуск',
      'out.title': 'Выбыли из игры',
      'cause.mafia': 'Жертва мафии',
      'cause.vote': 'Исключение голосованием',
      'cause.left': 'Выход из игры',
      'cause.survived': 'Остаётся в игре',

      'voteRes.eliminated': 'Город принял решение',
      'voteRes.none': 'Никто не исключён',
      'voteRes.majority': 'Город исключил игрока {name}. Роль: {role}.',
      'voteRes.tie': 'Голоса разделились поровну. Никто не исключён.',
      'voteRes.skip': 'Город решил никого не исключать.',
      'voteRes.noVotes': 'Никто не проголосовал. Никто не исключён.',

      'elim.title': 'Вы выбыли из игры',
      'elim.mafia': 'Мафия убила вас этой ночью.',
      'elim.vote': 'Город исключил вас голосованием.',
      'elim.default': 'Вы выбыли из игры.',
      'elim.note': 'Можно продолжать наблюдать и общаться с другими выбывшими.',
      'elim.keep': 'Продолжить наблюдение',

      'inv.title': 'Результат проверки',
      'inv.mafia': '{name} — мафия',
      'inv.town': '{name} — мирный житель',
      'inv.subMafia': 'Решайте, кому и когда об этом рассказать.',
      'inv.subTown': 'Этот игрок не мафия.',
      'notes.title': 'Записи детектива',
      'notes.prefix': 'Ночь {n}: {name} — ',
      'res.mafia': 'мафия',
      'res.town': 'мирный житель',

      'over.mafiaWins': 'Побеждает мафия',
      'over.townWins': 'Побеждают мирные жители',
      'over.textMafia': 'Мафия сравнялась с мирными жителями по числу или превзошла их. Мафия победила!',
      'over.textTown': 'Вся мафия устранена. Мирные жители победили!',
      'over.youWon': 'Ваша роль: {role}. Ваша сторона победила.',
      'over.youLost': 'Ваша роль: {role}. Ваша сторона проиграла.',
      'over.final': 'Роли игроков',
      'over.return': 'Вернуться в лобби',
      'over.returnHint': 'Вернуть всех в лобби может только хост.',

      'dead.title': 'Вы выбыли. Режим наблюдателя.',
      'dead.text': 'Вы можете наблюдать и общаться с другими выбывшими, но не можете действовать и голосовать.',

      'chat.title': 'Чат',
      'chat.placeholder': 'Введите сообщение',
      'chat.aria': 'Сообщение в чат',
      'chat.send': 'Отправить',
      'chat.empty': 'Сообщений пока нет.',
      'chat.room': 'Это видят все в комнате.',
      'chat.mafia': 'Чат мафии. Его видит только ваша команда.',
      'chat.town': 'Общий чат. Его видят все.',
      'chat.dead': 'Чат выбывших. Его видят только выбывшие игроки.',

      'err.notConnected': 'Нет соединения с сервером. Пробуем переподключиться...',
      'err.timeout': 'Сервер долго не отвечает. Попробуйте ещё раз.',
      'err.generic': 'Что-то пошло не так.',
      'err.nickname': 'Введите никнейм от {min} до {max} символов.',
      'err.codeFormat': 'Код комнаты — ровно 4 буквы или цифры.',
      'err.codeNeeded': 'Введите код комнаты из 4 символов, чтобы войти.',
      'err.needPlayers': 'Для старта нужно не меньше {min} игроков (подключено: {n}).',
      'toast.linkCopied': 'Ссылка-приглашение скопирована.',
      'toast.copyManual': 'Скопируйте ссылку: {url}',
      'toast.rejoinFail': 'Не удалось вернуться в игру.',
      'toast.rejoinFailWhy': 'Не удалось вернуться в игру: {reason}',
      'toast.kicked': 'Хост удалил вас из комнаты.',
      'toast.replaced': 'Игра открыта в другой вкладке, поэтому эта вкладка отключена.',
      'confirm.leave': 'Если выйти сейчас, вы будете исключены из игры. Всё равно выйти?',

      /* Server error messages (the server always sends these in English). */
      'srv.codeFormat': 'Код комнаты — ровно 4 буквы или цифры.',
      'srv.noFreeCode': 'Не удалось создать свободный код комнаты. Попробуйте ещё раз.',
      'srv.nameRequired': 'Нужно указать имя игрока.',
      'srv.nameShort': 'Имя должно содержать не менее {n} символов.',
      'srv.msgNotText': 'Сообщение должно быть текстом.',
      'srv.msgEmpty': 'Сообщение пустое.',
      'srv.noChatNight': 'Ночью писать в чат нельзя.',
      'srv.alreadyInRoom': 'Вы уже в комнате. Сначала выйдите из неё.',
      'srv.codeTaken': 'Этот код комнаты уже занят.',
      'srv.roomNotFound': 'Комната не найдена.',
      'srv.leftGame': 'Вы вышли из этой игры и не можете вернуться.',
      'srv.started': 'Игра уже началась.',
      'srv.roomFull': 'Комната заполнена.',
      'srv.nameTaken': 'Это имя уже занято в комнате.',
      'srv.needPlayers': 'Для старта нужно не меньше {n} подключённых игроков.',
      'srv.notInRoom': 'Вы не в комнате.',
      'srv.hostOnly': 'Это может сделать только хост.',
      'srv.notLiving': 'Выбранный игрок уже выбыл из игры.',
      'srv.kickLobbyOnly': 'Удалять игроков можно только в лобби.',
      'srv.playerNotFound': 'Игрок не найден.',
      'srv.kickSelf': 'Нельзя удалить самого себя.',
      'srv.notNight': 'Сейчас не ночь.',
      'srv.deadCantAct': 'Выбывшие игроки не могут действовать.',
      'srv.noNightAction': 'У вас нет ночного действия.',
      'srv.targetMafia': 'Нельзя выбрать члена своей мафии.',
      'srv.alreadyInvestigated': 'Этой ночью вы уже проверяли игрока.',
      'srv.investigateSelf': 'Нельзя проверять самого себя.',
      'srv.skipDayOnly': 'Пропустить можно только дневное обсуждение.',
      'srv.notVoting': 'Сейчас не время голосования.',
      'srv.deadCantVote': 'Выбывшие игроки не могут голосовать.',
      'srv.voteSelf': 'Нельзя голосовать за себя.',
      'srv.notOver': 'Игра ещё не закончена.',
      'srv.rateLimit': 'Слишком часто. Помедленнее.',
      'srv.rolesMismatch': 'Число ролей должно совпадать с числом игроков в комнате!',
      'srv.noMafia': 'Нужна хотя бы одна Мафия.',
      'srv.mafiaMajority': 'Мафии должно быть меньше, чем остальных ролей.',
      'srv.rolesLobbyOnly': 'Роли можно менять только в лобби.',
      'srv.rolesMissing': 'Не указаны настройки ролей.',
      'srv.roleCounts': 'Число ролей должно быть целым числом от 0 до {n}.',
      'srv.internal': 'Внутренняя ошибка сервера.',
    },
  };

  /** English server message → Russian key. */
  const SERVER_ERRORS = {
    'Room codes must be exactly 4 letters or digits.': 'srv.codeFormat',
    'Could not generate a free room code. Please try again.': 'srv.noFreeCode',
    'A player name is required.': 'srv.nameRequired',
    'Message must be text.': 'srv.msgNotText',
    'Message is empty.': 'srv.msgEmpty',
    'You cannot chat during the night.': 'srv.noChatNight',
    'You are already in a room. Leave it first.': 'srv.alreadyInRoom',
    'That room code is already taken.': 'srv.codeTaken',
    'Room not found.': 'srv.roomNotFound',
    'You left this game and cannot rejoin it.': 'srv.leftGame',
    'This game has already started.': 'srv.started',
    'The game has already started.': 'srv.started',
    'This room is full.': 'srv.roomFull',
    'That name is already taken in this room.': 'srv.nameTaken',
    'You are not in a room.': 'srv.notInRoom',
    'Only the host can do that.': 'srv.hostOnly',
    'You can only kick players in the lobby.': 'srv.kickLobbyOnly',
    'Player not found.': 'srv.playerNotFound',
    'You cannot kick yourself.': 'srv.kickSelf',
    'It is not night time.': 'srv.notNight',
    'Dead players cannot act.': 'srv.deadCantAct',
    'You have no night action.': 'srv.noNightAction',
    'You cannot target a fellow Mafia member.': 'srv.targetMafia',
    'You have already investigated someone tonight.': 'srv.alreadyInvestigated',
    'You cannot investigate yourself.': 'srv.investigateSelf',
    'You can only skip ahead during the day discussion.': 'srv.skipDayOnly',
    'It is not voting time.': 'srv.notVoting',
    'Dead players cannot vote.': 'srv.deadCantVote',
    'You cannot vote for yourself.': 'srv.voteSelf',
    'The game is not over yet.': 'srv.notOver',
    'You are doing that too fast. Slow down.': 'srv.rateLimit',
    'Role count must match total players in room!': 'srv.rolesMismatch',
    'At least one Mafia is required.': 'srv.noMafia',
    'Mafia must be outnumbered by the other roles.': 'srv.mafiaMajority',
    'Roles can only be changed in the lobby.': 'srv.rolesLobbyOnly',
    'Role settings are missing.': 'srv.rolesMissing',
    'Internal server error.': 'srv.internal',
  };

  /* ══════════════════════════ Socket & app state ══════════════════════════ */

  const socket = io(); // auto-detects the server URL
  const $ = (id) => document.getElementById(id);

  /** Latest personalised `room_state` from the server (null = not in a room). */
  let state = null;
  let clockOffset = 0;
  let busy = false;

  /** Client-only UI state. */
  const ui = {
    showRoleCard: false,
    roleRevealed: false,
    dayEvent: null,   // { day, killed } from the last `day_event`
    chat: [],
    replaced: false,
    prevPhase: null,
  };

  const MIN_NAME = 2;
  const MAX_NAME = 16;
  const IN_GAME = new Set(['night', 'day', 'voting']);
  /** Order of the role counters (also the keys of the `roles` payload sent to the server). */
  const ROLE_ORDER = ['Mafia', 'Detective', 'Doctor', 'Townsperson'];

  /* Host edits to the role counts are batched briefly; while any are pending or unacknowledged,
     incoming role settings must not overwrite the host's local numbers. */
  let roleSendTimer = null;
  let roleInFlight = 0;

  const NIGHT_ACTIONS = {
    Mafia: { accent: 'var(--mafia)', targets: (me, p) => p.alive && p.role !== 'Mafia' },
    Doctor: { accent: 'var(--doctor)', targets: (me, p) => p.alive },
    Detective: { accent: 'var(--detective)', targets: (me, p) => p.alive && p.id !== me.id },
  };

  /* ══════════════════════════ Storage helpers ══════════════════════════ */

  const store = {
    get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
    del(key) { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } },
  };
  const remember = {
    get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
  };

  /* ══════════════════════════ i18n engine ══════════════════════════ */

  function detectLang() {
    const saved = remember.get('mafia.lang');
    if (saved === 'en' || saved === 'ru') return saved;
    return (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }

  let lang = detectLang();

  /** Translate a key; `{name}` placeholders are filled in a single pass. */
  function t(key, params) {
    const value = I18N[lang][key] ?? I18N.en[key] ?? key;
    if (typeof value !== 'string') return key;
    return params ? value.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? '')) : value;
  }

  /** Plural-aware count ("1 vote", "2 голоса", "5 голосов"). */
  function tp(key, n) {
    const forms = I18N[lang][key] ?? I18N.en[key];
    const rule = new Intl.PluralRules(lang).select(n);
    return (forms[rule] ?? forms.other).replace('{n}', String(n));
  }

  const roleName = (role) => t(`role.${role}`);

  /** Server errors are always English; translate the known ones when in Russian. */
  function translateServerError(message) {
    if (typeof message !== 'string' || lang === 'en') return message;
    const known = SERVER_ERRORS[message];
    if (known) return t(known);
    let m = message.match(/^Names must be at least (\d+) characters long\.$/);
    if (m) return t('srv.nameShort', { n: m[1] });
    m = message.match(/^At least (\d+) connected players are required to start\.$/);
    if (m) return t('srv.needPlayers', { n: m[1] });
    m = message.match(/^Role counts must be whole numbers from 0 to (\d+)\.$/);
    if (m) return t('srv.roleCounts', { n: m[1] });
    if (/^That (target|suspect) is not a living player\.$/.test(message)) return t('srv.notLiving');
    return message;
  }

  /* ══════════════════════════ Small helpers ══════════════════════════ */

  /** Builds DOM safely: text always goes through textContent / text nodes. */
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  /** Renders `**bold**` segments as <strong> without ever using innerHTML. */
  function richInto(node, str) {
    node.replaceChildren(...str.split('**').map((part, i) =>
      (i % 2 ? el('strong', { text: part }) : document.createTextNode(part))));
  }

  /** Applies translations to everything declared in the static markup. */
  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-rich]').forEach((n) => richInto(n, t(n.dataset.i18nRich)));
    document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => n.setAttribute('placeholder', t(n.dataset.i18nPlaceholder)));
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
    document.querySelectorAll('.lang-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }

  function setLang(next) {
    if (next !== 'en' && next !== 'ru') return;
    if (next === lang) return;
    lang = next;
    remember.set('mafia.lang', lang);
    applyStatic();
    if (!state) checkRoomHint();
    render();
    renderChatMessages();
    if (currentModal && modalIsOpen()) fillModal(currentModal);
  }

  function toast(message, kind = 'error') {
    const box = $('toasts');
    const node = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status', text: message });
    node.addEventListener('click', () => node.remove());
    box.append(node);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => node.remove(), 5000);
  }

  function updateUrl(code) {
    try { history.replaceState(null, '', code ? `/room/${code}` : '/'); } catch { /* e.g. file:// */ }
  }

  function codeFromUrl() {
    const m = location.pathname.match(/^\/room\/([A-Za-z0-9]{4})\/?$/);
    if (m) return m[1].toUpperCase();
    const q = new URLSearchParams(location.search).get('room');
    return q && /^[A-Za-z0-9]{4}$/.test(q) ? q.toUpperCase() : '';
  }

  /**
   * Room codes are Latin letters and digits. If a player types with the Russian
   * keyboard layout, map each Cyrillic letter to the Latin key in the same position.
   */
  const RU_TO_LATIN = {
    'й': 'Q', 'ц': 'W', 'у': 'E', 'к': 'R', 'е': 'T', 'н': 'Y', 'г': 'U', 'ш': 'I', 'щ': 'O', 'з': 'P',
    'ф': 'A', 'ы': 'S', 'в': 'D', 'а': 'F', 'п': 'G', 'р': 'H', 'о': 'J', 'л': 'K', 'д': 'L',
    'я': 'Z', 'ч': 'X', 'с': 'C', 'м': 'V', 'и': 'B', 'т': 'N', 'ь': 'M',
  };
  function normalizeCode(raw) {
    return Array.from(String(raw).toLowerCase())
      .map((ch) => RU_TO_LATIN[ch] ?? ch.toUpperCase())
      .join('')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
  }

  /** Emit with ack, timeout and uniform (translated) error display. */
  function send(event, data, done) {
    if (!socket.connected) {
      toast(t('err.notConnected'));
      if (done) done(null);
      return;
    }
    socket.timeout(8000).emit(event, data, (err, res) => {
      if (err) {
        toast(t('err.timeout'));
        if (done) done(null);
        return;
      }
      if (!res || !res.ok) toast(translateServerError(res && res.error) || t('err.generic'));
      if (done) done(res);
    });
  }

  function lastLogText(type) {
    const entry = [...(state?.log ?? [])].reverse().find((l) => l.type === type);
    return entry ? entry.text : '';
  }

  /**
   * After a reconnect the client only has the English log line for last night.
   * Extract its data so it can be shown in the active language.
   */
  function parseNightLog() {
    const line = lastLogText('night_result');
    if (!line) return null;
    const body = line.replace(/^Day \d+ begins\.\s*/, '');
    const m = body.match(/^(.+) was killed by the Mafia during the night\. They were the (.+)\.$/);
    if (m) return { killed: { name: m[1], role: m[2] } };
    if (/no one died last night/.test(body)) return { killed: null };
    return null;
  }

  const nightResultText = (killed) => (killed
    ? t('night.killed', { name: killed.name, role: roleName(killed.role) })
    : t('night.peaceful'));

  function voteResultText(e) {
    switch (e.reason) {
      case 'majority':
        return t('voteRes.majority', { name: e.eliminated.name, role: roleName(e.eliminated.role) });
      case 'tie': return t('voteRes.tie');
      case 'skip': return t('voteRes.skip');
      default: return t('voteRes.noVotes');
    }
  }

  /* ══════════════════════════ Modal queue ══════════════════════════ */

  const modal = $('modal');
  const modalQueue = [];
  let currentModal = null;

  function modalIsOpen() { return modal.hasAttribute('open'); }

  /** `title`, `body` and `ok` are functions so an open popup can be re-rendered on language change. */
  function showModal(descriptor) {
    modalQueue.push(descriptor);
    if (!modalIsOpen()) nextModal();
  }

  function fillModal(m) {
    $('modalTitle').textContent = m.title();
    $('modalBody').replaceChildren(...[].concat(m.body()));
    $('modalOk').textContent = m.ok ? m.ok() : t('modal.ok');
    modal.dataset.tone = m.tone || '';
  }

  function nextModal() {
    const m = modalQueue.shift();
    currentModal = m || null;
    if (!m) return;
    fillModal(m);
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    $('modalOk').focus();
  }

  $('modalOk').addEventListener('click', () => {
    if (typeof modal.close === 'function') modal.close();
    else { modal.removeAttribute('open'); nextModal(); }
  });
  modal.addEventListener('close', nextModal);

  /* ══════════════════════════ Reusable row builders ══════════════════════════ */

  function avatar(name) {
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)) % 360;
    return el('span', {
      class: 'avatar', 'aria-hidden': 'true',
      style: `background:hsl(${hue} 38% 28%);color:hsl(${hue} 80% 86%)`,
    }, (Array.from(name)[0] || '?').toUpperCase());
  }

  const tag = (text, kind = '') => el('span', { class: `tag ${kind}`.trim(), text });

  function roleTag(role) {
    return el('span', { class: 'tag', 'data-role': role, text: roleName(role) });
  }

  function playerRow(p, { tags = [], sub = null, button = null } = {}) {
    return el('li', { class: `row${p.alive === false ? ' out' : ''}` },
      avatar(p.name),
      el('div', { class: 'row-main' },
        el('span', { class: 'row-name', text: p.name }),
        sub ? el('span', { class: 'row-sub', text: sub }) : null),
      el('div', { class: 'row-tags' }, tags),
      button);
  }

  function pickButton({ label, pressed, disabled, onClick, accent }) {
    return el('button', {
      class: 'btn btn-sm pick', type: 'button',
      'aria-pressed': String(!!pressed), disabled: !!disabled,
      style: accent ? `--accent:${accent}` : false, onclick: onClick,
    }, label);
  }

  const nameOf = (id) => state?.players.find((p) => p.id === id)?.name ?? '?';

  /* ══════════════════════════ Rendering ══════════════════════════ */

  const SCREENS = ['join', 'lobby', 'role', 'night', 'day', 'over'];

  function pickScreen() {
    if (!state) return 'join';
    if (state.phase === 'lobby') return 'lobby';
    if (state.phase === 'ended') return 'over';
    if (ui.showRoleCard && state.you.role) return 'role';
    return state.phase === 'night' ? 'night' : 'day';
  }

  function render() {
    const phase = state ? state.phase : 'none';
    document.body.dataset.phase = phase;
    document.body.dataset.winner = state && state.winner ? state.winner : '';

    const screen = pickScreen();
    for (const name of SCREENS) $(`screen-${name}`).hidden = name !== screen;

    renderTopbar();
    if (state) {
      if (screen === 'lobby') renderLobby();
      if (screen === 'role') renderRole();
      if (screen === 'night') renderNight();
      if (screen === 'day') renderDay();
      if (screen === 'over') renderOver();
    }
    renderDeadBanner(screen);
    renderNotes(screen);
    renderChat(screen);
    tick();
  }

  function renderTopbar() {
    $('topbar').hidden = !state;
    if (!state) return;
    $('roomChip').textContent = t('room.chip', { code: state.code });
    const keys = { lobby: 'phase.lobby', night: 'phase.night', day: 'phase.day', voting: 'phase.voting', ended: 'phase.ended' };
    $('phaseLabel').textContent = keys[state.phase] ? t(keys[state.phase], { n: state.day }) : '';
    $('roleBtn').hidden = !(IN_GAME.has(state.phase) && !!state.you.role);
    $('roleBtn').textContent = ui.showRoleCard ? t('btn.backToGame') : t('btn.role');
  }

  /* ── Screen 2: Lobby ── */
  function renderLobby() {
    const me = state.you;
    $('lobbyCode').textContent = state.code;
    $('lobbyCount').textContent = t('lobby.count', { n: state.players.length, max: state.maxPlayers });

    $('lobbyList').replaceChildren(...state.players.map((p) => {
      const tags = [];
      if (p.isHost) tags.push(tag(t('tag.host'), 'host'));
      if (p.id === me.id) tags.push(tag(t('tag.you')));
      if (!p.connected) tags.push(tag(t('tag.offline')));
      const kick = me.isHost && p.id !== me.id
        ? el('button', {
            class: 'btn btn-xs', type: 'button', 'aria-label': t('lobby.removeAria', { name: p.name }),
            onclick: () => send('kick_player', { playerId: p.id }),
          }, t('lobby.remove'))
        : null;
      return playerRow(p, { tags, button: kick });
    }));

    const connected = state.players.filter((p) => p.connected).length;
    $('hostControls').hidden = !me.isHost;
    $('guestWait').hidden = me.isHost;

    renderRoleSettings();

    // Start is only possible when the role setup is valid; the reason is always shown.
    const problem = currentRoleProblem();
    $('startBtn').disabled = !!problem;
    const hint = $('startHint');
    hint.classList.toggle('start-error', !!problem && problem !== 'minPlayers');
    if (problem === 'minPlayers') hint.textContent = t('lobby.hintWaiting', { min: state.minPlayers, n: connected });
    else if (problem) hint.textContent = t(`roles.err.${problem}`);
    else hint.textContent = t('lobby.hintReady', { n: connected });
  }

  /* ── Lobby: role settings (host edits, everyone sees them live) ── */
  const sumCounts = (counts) => ROLE_ORDER.reduce((sum, role) => sum + (counts[role] || 0), 0);

  /** Mirrors the server's checks; the server stays the authority when the game actually starts. */
  function roleProblem(counts, connected, minPlayers) {
    if (connected < minPlayers) return 'minPlayers';
    const total = sumCounts(counts);
    if (total !== connected) return 'mismatch';
    if (counts.Mafia < 1) return 'noMafia';
    if (counts.Mafia >= total - counts.Mafia) return 'mafiaMajority';
    return null;
  }

  function currentRoleProblem() {
    const rs = state && state.roleSettings;
    if (!rs) return null;
    return roleProblem(rs.counts, state.players.filter((p) => p.connected).length, state.minPlayers);
  }

  const rolesLocked = () => roleSendTimer !== null || roleInFlight > 0;

  /** While the host is mid-edit the local numbers win, so a late echo can't make them jump back. */
  function incomingRoleSettings(next) {
    if (rolesLocked() && state && state.roleSettings) {
      return { ...next, counts: state.roleSettings.counts, custom: state.roleSettings.custom };
    }
    return next;
  }

  function onRoleUpdateAck(res) {
    roleInFlight = Math.max(0, roleInFlight - 1);
    if (res && res.ok) {
      if (!rolesLocked() && state && state.roleSettings) { state.roleSettings = res.roles; render(); }
    } else {
      send('request_state', {}); // the server rejected it: fall back to the server's numbers
    }
  }

  function queueRoleUpdate() {
    clearTimeout(roleSendTimer);
    roleSendTimer = setTimeout(() => {
      roleSendTimer = null;
      if (!state || !state.roleSettings) return;
      roleInFlight += 1;
      send('update_roles', { roles: { ...state.roleSettings.counts } }, onRoleUpdateAck);
    }, 90);
  }

  function stepRole(role, delta) {
    const rs = state && state.roleSettings;
    if (!rs || !state.you.isHost) return;
    const value = Math.max(0, Math.min(state.maxPlayers, rs.counts[role] + delta));
    if (value === rs.counts[role]) return;
    state.roleSettings = { ...rs, counts: { ...rs.counts, [role]: value }, custom: true };
    render();
    queueRoleUpdate();
  }

  function autoBalance() {
    if (!state || !state.you.isHost) return;
    clearTimeout(roleSendTimer);
    roleSendTimer = null;
    roleInFlight += 1;
    send('update_roles', { auto: true }, onRoleUpdateAck);
  }

  function renderRoleSettings() {
    const rs = state.roleSettings;
    $('roleSettings').hidden = !rs;
    if (!rs) return;

    const isHost = state.you.isHost;
    const connected = state.players.filter((p) => p.connected).length;
    const total = sumCounts(rs.counts);

    $('roleIntro').textContent = t(isHost ? 'roles.hostIntro' : 'roles.guestIntro');

    $('roleList').replaceChildren(...ROLE_ORDER.map((role) => {
      const value = rs.counts[role];
      const control = isHost
        ? el('div', { class: 'stepper' },
            el('button', {
              class: 'btn stepper-btn', type: 'button', disabled: value <= 0,
              'aria-label': t('roles.dec', { role: roleName(role) }),
              onclick: () => stepRole(role, -1),
            }, '\u2212'),
            el('span', { class: 'stepper-value', 'aria-live': 'polite', text: String(value) }),
            el('button', {
              class: 'btn stepper-btn', type: 'button', disabled: value >= state.maxPlayers,
              'aria-label': t('roles.inc', { role: roleName(role) }),
              onclick: () => stepRole(role, 1),
            }, '+'))
        : el('span', { class: 'role-count', text: String(value) });
      return el('li', { class: 'role-row', 'data-role': role },
        el('span', { class: 'role-swatch', 'aria-hidden': 'true' }),
        el('span', { class: 'role-name', text: roleName(role) }),
        control);
    }));

    const totalEl = $('roleTotal');
    totalEl.textContent = t('roles.total', { roles: total, players: connected });
    totalEl.classList.toggle('ok', total === connected && connected > 0);
    totalEl.classList.toggle('bad', total !== connected);

    $('roleMode').textContent = t(rs.custom ? 'roles.modeCustom' : 'roles.modeAuto');
    $('roleAutoBtn').hidden = !isHost;
    $('roleAutoBtn').disabled = !rs.custom;
  }

  /* ── Screen 3: Role card ── */
  function renderRole() {
    const role = state.you.role;
    $('roleCard').dataset.role = role;
    $('roleCard').classList.toggle('revealed', ui.roleRevealed);
    $('roleName').textContent = roleName(role);
    $('roleDesc').textContent = t(`role.desc.${role}`);
    $('roleGoal').textContent = t(role === 'Mafia' ? 'role.goal.Mafia' : 'role.goal.Town');
    $('roleFront').setAttribute('aria-hidden', String(!ui.roleRevealed));
    $('roleBack').setAttribute('aria-hidden', String(ui.roleRevealed));
    $('toggleRoleBtn').textContent = ui.roleRevealed ? t('role.hide') : t('role.show');

    const team = $('roleTeam');
    const mates = role === 'Mafia' ? state.you.teammates : [];
    team.hidden = mates.length === 0;
    team.replaceChildren(
      ...(mates.length
        ? [el('span', { class: 'muted', text: t(mates.length === 1 ? 'role.partner' : 'role.partners') }),
           ...mates.map((m) => playerRow({ name: m.name, alive: true }))]
        : []));
  }

  /* ── Screen 4: Night ── */
  function renderNight() {
    const me = state.you;
    const cfg = NIGHT_ACTIONS[me.role];

    let title;
    let text;
    if (!me.alive) {
      title = t('night.specTitle');
      text = t(cfg ? 'night.specTextAct' : 'night.specText');
    } else if (!cfg) {
      title = t('night.sleepTitle');
      text = t('night.sleepText');
    } else {
      title = t('night.title', { n: state.day });
      text = t('night.text');
    }
    $('nightTitle').textContent = title;
    $('nightText').textContent = text;

    $('nightActions').hidden = !cfg;
    if (cfg) renderNightActions(me, cfg);
  }

  function renderNightActions(me, cfg) {
    const role = me.role;
    const night = state.night; // null when dead or when no action is available
    const myTarget = night ? night.myTarget : null;
    const locked = !!(night && night.locked);
    const canAct = me.alive && !!night && !locked;

    $('nightActions').style.setProperty('--accent', cfg.accent);
    $('nightHeading').textContent = t(`act.${role}.heading`);
    const mates = role === 'Mafia' ? me.teammates.map((m) => m.name) : [];
    $('nightHelp').textContent = t(`act.${role}.help`) + (mates.length ? t('night.mates', { names: mates.join(', ') }) : '');

    const teamPicks = night ? night.teamPicks : [];
    const rows = state.players.filter((p) => cfg.targets(me, p)).map((p) => {
      const tags = [];
      if (p.id === me.id) tags.push(tag(t('tag.you')));
      for (const pick of teamPicks.filter((x) => x.targetId === p.id)) {
        tags.push(tag(pick.mafiaId === me.id ? t('night.pickYours') : t('night.pickOf', { name: nameOf(pick.mafiaId) }), 'danger'));
      }
      return playerRow(p, {
        tags,
        button: pickButton({
          label: myTarget === p.id ? t(`act.${role}.done`) : t(`act.${role}.verb`),
          pressed: myTarget === p.id,
          disabled: !canAct,
          accent: cfg.accent,
          onClick: () => send('night_action', { targetId: p.id }),
        }),
      });
    });
    $('nightList').replaceChildren(...rows);

    let status;
    if (!me.alive) status = t('status.dead');
    else if (locked) status = t('status.locked', { name: nameOf(myTarget) });
    else if (myTarget) status = t('status.chose', { name: nameOf(myTarget) }) + (role === 'Detective' ? '' : t('status.change'));
    else status = t('status.pick');
    $('nightStatus').textContent = status;
  }

  /* ── Screen 5: Day / Voting ── */
  function renderDay() {
    const me = state.you;
    const voting = state.phase === 'voting';
    const v = state.vote || { counts: {}, skip: 0, voted: [], total: 0, myVote: null };

    let outcome = null;
    if (ui.dayEvent && ui.dayEvent.day === state.day) outcome = { killed: ui.dayEvent.killed };
    else outcome = parseNightLog();

    $('dayTitle').textContent = t('day.title', { n: state.day });
    $('dayText').textContent = outcome ? nightResultText(outcome.killed) : '';
    $('dayAnnounce').classList.toggle('deadly', !!(outcome && outcome.killed));

    $('dayHeading').textContent = voting ? t('day.whoMafia') : t('day.discussion');
    $('dayStatus').textContent = voting
      ? t('day.statusVoting', { voted: v.voted.length, total: v.total })
      : t('day.statusDiscussion');

    const alive = state.players.filter((p) => p.alive);
    $('voteList').replaceChildren(...alive.map((p) => {
      const tags = [];
      if (p.id === me.id) tags.push(tag(t('tag.you')));
      if (voting && v.voted.includes(p.id)) tags.push(tag(t('vote.voted'), 'ok'));
      const n = v.counts[p.id] || 0;
      if (voting && n > 0) tags.push(tag(tp('plural.votes', n), 'votes'));
      return playerRow(p, {
        tags,
        button: pickButton({
          label: v.myVote === p.id ? t('vote.voted') : t('vote.cast'),
          pressed: v.myVote === p.id,
          disabled: !voting || !me.alive || p.id === me.id,
          onClick: () => castVote(p.id),
        }),
      });
    }));

    const skip = $('skipVoteBtn');
    skip.textContent = t('vote.skip') + (voting && v.skip ? ` (${v.skip})` : '');
    skip.setAttribute('aria-pressed', String(v.myVote === 'skip'));
    skip.disabled = !voting || !me.alive;

    $('advanceBtn').hidden = !(me.isHost && state.phase === 'day');

    const out = state.players.filter((p) => !p.alive);
    $('outCard').hidden = out.length === 0;
    $('outList').replaceChildren(...out.map((p) => playerRow(p, {
      sub: causeText(p),
      tags: [p.role ? roleTag(p.role) : null],
    })));
  }

  function causeText(p) {
    if (p.deathCause === 'mafia') return t('cause.mafia');
    if (p.deathCause === 'vote') return t('cause.vote');
    if (p.deathCause === 'left') return t('cause.left');
    return null;
  }

  function castVote(targetId) {
    send('cast_vote', { targetId }, (res) => {
      if (res && res.ok && state && state.vote) {
        state.vote.myVote = res.targetId === null ? 'skip' : res.targetId;
        render();
      }
    });
  }

  /* ── Screen 6: Game over ── */
  function renderOver() {
    const me = state.you;
    const mafiaWon = state.winner === 'Mafia';
    $('verdict').dataset.winner = state.winner || '';
    $('overTitle').textContent = t(mafiaWon ? 'over.mafiaWins' : 'over.townWins');
    $('overText').textContent = t(mafiaWon ? 'over.textMafia' : 'over.textTown');
    const won = (me.role === 'Mafia') === mafiaWon;
    $('overYou').textContent = me.role ? t(won ? 'over.youWon' : 'over.youLost', { role: roleName(me.role) }) : '';

    $('overList').replaceChildren(...state.players.map((p) => {
      const tags = [p.role ? roleTag(p.role) : null];
      if (p.id === me.id) tags.push(tag(t('tag.you')));
      return playerRow(p, { tags, sub: p.alive ? t('cause.survived') : causeText(p) });
    }));

    $('returnBtn').disabled = !me.isHost;
    $('returnHint').hidden = me.isHost;
  }

  /* ── Shared panels ── */
  function renderDeadBanner(screen) {
    $('deadBanner').hidden = !(state && IN_GAME.has(state.phase) && !state.you.alive && screen !== 'role');
  }

  function renderNotes(screen) {
    const list = state && state.you.role === 'Detective' ? state.you.investigations : [];
    const show = !!state && IN_GAME.has(state.phase) && screen !== 'role' && list.length > 0;
    $('notes').hidden = !show;
    if (!show) return;
    $('notesList').replaceChildren(...list.map((n) => el('li', {},
      t('notes.prefix', { n: n.day, name: n.targetName }),
      el('span', { class: n.result === 'Mafia' ? 'bad' : 'good', text: t(n.result === 'Mafia' ? 'res.mafia' : 'res.town') }))));
  }

  function chatMode(screen) {
    if (!state || screen === 'role' || screen === 'join') return null;
    const me = state.you;
    switch (state.phase) {
      case 'lobby':
      case 'ended':
        return { label: t('chat.room'), enabled: true };
      case 'night':
        return me.alive && me.role === 'Mafia' ? { label: t('chat.mafia'), enabled: true } : null;
      default:
        return me.alive ? { label: t('chat.town'), enabled: true } : { label: t('chat.dead'), enabled: true };
    }
  }

  function renderChat(screen) {
    const mode = chatMode(screen);
    $('chat').hidden = !mode;
    if (!mode) return;
    $('chatChannel').textContent = mode.label;
    $('chatInput').disabled = !mode.enabled;
    $('chatSend').disabled = !mode.enabled;
  }

  function renderChatMessages() {
    const log = $('chatLog');
    if (ui.chat.length === 0) {
      log.replaceChildren(el('li', { class: 'msg-empty', text: t('chat.empty') }));
      return;
    }
    log.replaceChildren(...ui.chat.map((m) => el('li', {
      class: `msg ${m.channel}${state && m.from.id === state.you.id ? ' mine' : ''}`,
    }, el('span', { class: 'msg-name', text: m.from.name }), el('span', { class: 'msg-text', text: m.text }))));
    log.scrollTop = log.scrollHeight;
  }

  /* ══════════════════════════ Countdown ══════════════════════════ */

  function tick() {
    const timer = $('phaseTimer');
    if (!state || !state.phaseEndsAt) { timer.hidden = true; return; }
    const remain = Math.max(0, Math.ceil((state.phaseEndsAt - (Date.now() + clockOffset)) / 1000));
    timer.hidden = false;
    timer.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
    timer.classList.toggle('urgent', remain <= 10);
  }
  setInterval(tick, 250);

  /* ══════════════════════════ Join / create / leave ══════════════════════════ */

  const nameInput = $('nameInput');
  const codeInput = $('codeInput');

  function setBusy(value) {
    busy = value;
    $('createBtn').disabled = value;
    $('joinBtn').disabled = value;
  }

  function readName() {
    const name = nameInput.value.replace(/\s+/g, ' ').trim();
    if (name.length < MIN_NAME || name.length > MAX_NAME) {
      toast(t('err.nickname', { min: MIN_NAME, max: MAX_NAME }));
      nameInput.focus();
      return null;
    }
    remember.set('mafia.name', name);
    return name;
  }

  function enteredRoom(res) {
    store.set('mafia.session', { code: res.code, playerId: res.playerId });
    updateUrl(res.code);
  }

  function createRoom() {
    if (busy) return;
    const name = readName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{4}$/.test(code)) { toast(t('err.codeFormat')); codeInput.focus(); return; }
    ui.replaced = false;
    setBusy(true);
    send('create_room', { name, code: code || undefined }, (res) => {
      setBusy(false);
      if (res && res.ok) enteredRoom(res);
    });
  }

  function joinRoom() {
    if (busy) return;
    const name = readName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast(t('err.codeNeeded')); codeInput.focus(); return; }
    ui.replaced = false;
    const saved = store.get('mafia.session');
    setBusy(true);
    send('join_room', { code, name, playerId: saved && saved.code === code ? saved.playerId : undefined }, (res) => {
      setBusy(false);
      if (res && res.ok) enteredRoom(res);
    });
  }

  function resetToJoinScreen() {
    store.del('mafia.session');
    clearTimeout(roleSendTimer);
    roleSendTimer = null;
    roleInFlight = 0;
    state = null;
    ui.showRoleCard = false;
    ui.roleRevealed = false;
    ui.dayEvent = null;
    ui.chat = [];
    ui.prevPhase = null;
    updateUrl(null);
    codeInput.value = '';
    $('codeHint').textContent = t('hint.default');
    renderChatMessages();
    render();
  }

  function leaveRoom() {
    if (!state) return;
    if (IN_GAME.has(state.phase) && state.you.alive && !confirm(t('confirm.leave'))) return;
    send('leave_room', {}, (res) => { if (res && res.ok) resetToJoinScreen(); });
  }

  /** Re-attach to the same seat after a refresh or dropped connection. */
  function resume() {
    const saved = store.get('mafia.session');
    if (!saved || ui.replaced) return;
    socket.timeout(8000).emit('join_room', { code: saved.code, playerId: saved.playerId }, (err, res) => {
      if (err) return; // try again on the next connect
      if (res && res.ok) { updateUrl(res.code); return; }
      resetToJoinScreen();
      const why = translateServerError(res && res.error);
      toast(why ? t('toast.rejoinFailWhy', { reason: why }) : t('toast.rejoinFail'), 'info');
    });
  }

  let hintTimer = null;
  async function checkRoomHint() {
    const code = codeInput.value.toUpperCase();
    const hint = $('codeHint');
    if (!/^[A-Z0-9]{4}$/.test(code)) { hint.textContent = t('hint.default'); return; }
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (codeInput.value.toUpperCase() !== code) return; // input changed meanwhile
      if (res.status === 404) {
        hint.textContent = t('hint.noRoom');
      } else if (res.ok) {
        const info = await res.json();
        hint.textContent = info.joinable
          ? t('hint.open', { code, players: tp('plural.players', info.players) })
          : t('hint.closed');
      } else {
        hint.textContent = t('hint.default');
      }
    } catch {
      hint.textContent = t('hint.default');
    }
  }

  codeInput.addEventListener('input', () => {
    codeInput.value = normalizeCode(codeInput.value);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(checkRoomHint, 250);
  });
  $('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (codeInput.value.trim().length === 4) joinRoom(); else createRoom();
  });
  $('createBtn').addEventListener('click', createRoom);
  $('joinBtn').addEventListener('click', joinRoom);
  $('leaveBtn').addEventListener('click', leaveRoom);

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  /* ══════════════════════════ In-room controls ══════════════════════════ */

  async function copyInvite() {
    if (!state) return;
    const url = `${location.origin}/room/${state.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('toast.linkCopied'), 'ok');
    } catch {
      toast(t('toast.copyManual', { url }), 'info');
    }
  }

  $('copyLinkBtn').addEventListener('click', copyInvite);

  $('startBtn').addEventListener('click', () => {
    if (!state) return;
    const problem = currentRoleProblem();
    if (problem) { // the button is normally disabled; this guards against stale clicks
      const connected = state.players.filter((p) => p.connected).length;
      toast(problem === 'minPlayers'
        ? t('err.needPlayers', { min: state.minPlayers, n: connected })
        : t(`roles.err.${problem}`));
      return;
    }
    // With a hand-made setup, send the counts along so the start can never race an unsent edit.
    const rs = state.roleSettings;
    const payload = rs && rs.custom ? { roles: { ...rs.counts } } : {};
    clearTimeout(roleSendTimer);
    roleSendTimer = null;
    send('start_game', payload);
  });
  $('roleAutoBtn').addEventListener('click', autoBalance);

  $('advanceBtn').addEventListener('click', () => send('advance_phase', {}));
  $('skipVoteBtn').addEventListener('click', () => castVote(null));
  $('returnBtn').addEventListener('click', () => send('play_again', {}));

  $('roleBtn').addEventListener('click', () => {
    ui.showRoleCard = !ui.showRoleCard;
    ui.roleRevealed = false;
    render();
  });
  $('toggleRoleBtn').addEventListener('click', () => {
    ui.roleRevealed = !ui.roleRevealed;
    render();
  });
  $('roleContinueBtn').addEventListener('click', () => {
    ui.showRoleCard = false;
    ui.roleRevealed = false;
    render();
  });

  // Hide the role whenever the tab is backgrounded (e.g. locking the phone).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.roleRevealed) { ui.roleRevealed = false; render(); }
  });

  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) return;
    send('chat_message', { text }, (res) => { if (res && res.ok) input.value = ''; });
  });

  /* ══════════════════════════ Server events ══════════════════════════ */

  socket.on('connect', () => {
    $('conn').hidden = true;
    resume();
  });
  socket.on('disconnect', () => { $('conn').hidden = false; });
  socket.on('connect_error', () => { $('conn').hidden = false; });

  socket.on('room_state', (s) => {
    clockOffset = s.serverTime - Date.now();
    if (s.phase === 'lobby' && ui.prevPhase && ui.prevPhase !== 'lobby') {
      ui.chat = [];
      ui.dayEvent = null;
      ui.showRoleCard = false;
      ui.roleRevealed = false;
      renderChatMessages();
    }
    ui.prevPhase = s.phase;
    if (s.roleSettings) s.roleSettings = incomingRoleSettings(s.roleSettings);
    state = s;
    render();
  });

  // Live sync: the host's role counters reach everyone in the lobby as they change.
  socket.on('roles_updated', (settings) => {
    if (!state || state.phase !== 'lobby') return;
    state.roleSettings = incomingRoleSettings(settings);
    render();
  });

  socket.on('game_started', () => {
    ui.showRoleCard = true;
    ui.roleRevealed = false;
    ui.dayEvent = null;
    ui.chat = [];
    renderChatMessages();
  });

  socket.on('phase_changed', (p) => {
    clockOffset = p.serverTime - Date.now();
    // Night keeps the role card open (it opens at game start); any later phase closes it.
    if (p.phase !== 'night') { ui.showRoleCard = false; ui.roleRevealed = false; }
  });

  // The announcement text is rebuilt on the client from structured data, so it follows the active language.
  socket.on('day_event', (e) => { ui.dayEvent = { day: e.day, killed: e.killed }; });

  socket.on('player_eliminated', (e) => {
    if (!state || e.id !== state.you.id || e.cause === 'left') return;
    showModal({
      title: () => t('elim.title'),
      tone: 'mafia',
      body: () => [
        el('p', { text: t(e.cause === 'mafia' ? 'elim.mafia' : e.cause === 'vote' ? 'elim.vote' : 'elim.default') }),
        el('p', { class: 'muted', text: t('elim.note') }),
      ],
      ok: () => t('elim.keep'),
    });
  });

  socket.on('investigation_result', (r) => {
    const isMafia = r.result === 'Mafia';
    if (state) {
      state.you.investigations = [...state.you.investigations,
        { day: state.day, targetId: r.targetId, targetName: r.targetName, result: r.result }];
    }
    showModal({
      title: () => t('inv.title'),
      tone: isMafia ? 'mafia' : 'town',
      body: () => [
        el('p', { class: `modal-big ${isMafia ? 'mafia' : 'town'}`, text: t(isMafia ? 'inv.mafia' : 'inv.town', { name: r.targetName }) }),
        el('p', { class: 'muted', text: t(isMafia ? 'inv.subMafia' : 'inv.subTown') }),
      ],
    });
    render();
  });

  socket.on('night_action_confirmed', (e) => {
    if (!state || !state.night) return;
    state.night.myTarget = e.targetId;
    if (e.role === 'Detective') state.night.locked = true;
    render();
  });

  socket.on('mafia_picks', (e) => {
    if (!state || !state.night) return;
    state.night.teamPicks = e.picks;
    render();
  });

  socket.on('vote_update', (v) => {
    if (!state || state.phase !== 'voting') return;
    state.vote = { ...(state.vote || {}), counts: v.counts, skip: v.skip, voted: v.voted, total: v.total };
    render();
  });

  socket.on('vote_result', (e) => {
    showModal({
      title: () => t(e.eliminated ? 'voteRes.eliminated' : 'voteRes.none'),
      tone: e.eliminated && e.eliminated.role === 'Mafia' ? 'town' : '',
      body: () => {
        const nodes = [el('p', { text: voteResultText(e) })];
        if (e.votes.length) {
          nodes.push(el('ul', { class: 'list' }, e.votes.map((v) => el('li', { class: 'vote-line' },
            el('strong', { text: v.voterName }),
            v.targetName ? [t('vote.for'), el('strong', { text: v.targetName })] : t('vote.skipped')))));
        }
        return nodes;
      },
    });
  });

  // The verdict text is derived from `state.winner` in the active language (see renderOver).
  socket.on('game_over', () => { /* room_state follows with phase "ended" */ });

  socket.on('chat_message', (m) => {
    ui.chat.push(m);
    if (ui.chat.length > 100) ui.chat.shift();
    renderChatMessages();
  });

  socket.on('kicked', () => {
    resetToJoinScreen();
    toast(t('toast.kicked'));
  });

  socket.on('session_replaced', () => {
    ui.replaced = true;
    state = null;
    render();
    toast(t('toast.replaced'), 'info');
  });

  socket.on('error_message', (e) => toast(translateServerError(e.message) || t('err.generic')));

  /* ══════════════════════════ Boot ══════════════════════════ */

  applyStatic();
  nameInput.value = remember.get('mafia.name');
  codeInput.value = codeFromUrl();
  $('codeHint').textContent = t('hint.default');
  if (codeInput.value) checkRoomHint();
  renderChatMessages();
  render();
  (codeInput.value && nameInput.value ? $('joinBtn') : nameInput).focus({ preventScroll: true });
})();
</script>

<!-- PWA: register the service worker once the page has loaded -->
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
</script>
</body>
</html>

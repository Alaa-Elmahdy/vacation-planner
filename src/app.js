:root {
  --bg: #f6f3f4;
  --card: #ffffff;
  --text: #2f3137;
  --muted: #747782;
  --line: #e6dde1;
  --primary: #8f1f43;
  --primary2: #b2385d;
  --soft: #f5e6eb;
  --shadow: 0 18px 45px rgba(143, 31, 67, 0.10);
  font-family: Inter, "Segoe UI", Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

.app-header {
  width: min(1280px, calc(100% - 24px));
  margin: 18px auto;
  padding: 24px;
  border-radius: 28px;
  background: var(--card);
  box-shadow: var(--shadow);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.eyebrow {
  margin: 0;
  color: var(--primary);
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
  font-size: 12px;
}

h1 {
  margin: 8px 0;
  font-size: clamp(32px, 5vw, 56px);
  letter-spacing: -0.05em;
}

.layout {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto 40px;
  display: grid;
  grid-template-columns: 0.9fr 1.2fr;
  gap: 18px;
}

.panel {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.panel:nth-child(3) {
  grid-column: 1 / -1;
}

.panel-head {
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(90deg, var(--soft), white);
}

.panel-head h2 {
  margin: 0;
  color: var(--primary);
}

.form-grid {
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-weight: 700;
  font-size: 13px;
}

.full {
  grid-column: 1 / -1;
}

input,
select,
textarea,
button {
  font: inherit;
}

input,
select,
textarea {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  color: var(--text);
}

textarea {
  min-height: 100px;
  resize: vertical;
}

button {
  border: 1px solid var(--line);
  background: white;
  border-radius: 14px;
  padding: 12px 16px;
  cursor: pointer;
  font-weight: 800;
}

button.primary {
  color: white;
  background: linear-gradient(135deg, var(--primary), var(--primary2));
  border: 0;
}

.items {
  padding: 18px;
  display: grid;
  gap: 12px;
}

.item-card {
  border: 1px solid var(--line);
  border-left: 6px solid var(--primary);
  border-radius: 18px;
  padding: 14px;
  background: #fff;
}

.item-card h3 {
  margin: 0 0 6px;
}

.item-card p {
  margin: 4px 0;
  color: var(--muted);
}

.badge {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 900px) {
  .app-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .layout {
    grid-template-columns: 1fr;
  }

  .panel:nth-child(3) {
    grid-column: auto;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .full {
    grid-column: auto;
  }
}
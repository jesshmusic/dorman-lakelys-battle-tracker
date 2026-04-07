const MODULE_ID = "dorman-lakelys-battle-tracker";
const MODULE_TITLE = "Dorman Lakely's Battle Tracker";
const FLAG_KEY = "battleState";
const PRESETS_KEY = "battlePresets";
const SOCKET_NAME = `module.${MODULE_ID}`;

function getModuleVersion() {
  return game.modules.get(MODULE_ID)?.version ?? "unknown";
}

function logModuleHeader() {
  const version = getModuleVersion();
  console.log(
    '%c⚔️ ' + MODULE_TITLE + ' %cv' + version,
    'color: #d32f2f; font-weight: bold; font-size: 16px;',
    'color: #ff9800; font-weight: bold; font-size: 14px;'
  );
}

function logModuleReady() {
  console.log(
    '%c⚔️ ' + MODULE_TITLE + ' %c✓ Ready!',
    'color: #d32f2f; font-weight: bold; font-size: 16px;',
    'color: #4caf50; font-weight: bold; font-size: 14px;'
  );
}

// ── Default Battle State ───────────────────────────────────────────────────────

function defaultBattleState() {
  return {
    active: false,
    name: "New Battle",
    factions: {
      a: { name: "Faction A", color: "#4a90d9", hp: 50, maxHp: 50, modifiers: [] },
      b: { name: "Faction B", color: "#d94a4a", hp: 50, maxHp: 50, modifiers: [] },
    },
    eventLog: [],
    crossedThresholds: { a: [], b: [] },
    eventTables: {
      aWins: [
        "#{a}'s shield wall pushes forward!",
        "A rallying cry goes up from #{a}'s banner!",
        "#{b}'s archers are driven from their position!",
        "#{a}'s warriors break through a weak point in the line!",
        "A champion of #{a} cuts down an enemy captain!",
        "#{b}'s left flank falls back in disorder!",
      ],
      bWins: [
        "#{b}'s berserkers break through a shield wall!",
        "The #{b} banner advances relentlessly!",
        "#{a}'s forces are pushed back toward the river!",
        "#{b}'s warriors overwhelm a forward position!",
        "A champion of #{b} rallies their troops with a battle cry!",
        "#{a}'s right flank begins to buckle!",
      ],
      stalemate: [
        "The lines clash but neither side gives ground.",
        "Arrows darken the sky, but the shield walls hold.",
        "Both sides pull back momentarily to regroup.",
        "The fighting intensifies but the line holds steady.",
      ],
      thresholds: {
        75: {
          a: "#{a}'s forces are gaining the upper hand — #{b}'s warriors grow uneasy!",
          b: "#{b}'s forces press the advantage — #{a}'s line wavers!",
        },
        50: {
          a: "#{a}'s relentless assault is breaking #{b}'s spirit!",
          b: "#{b}'s onslaught drives #{a}'s forces to the brink!",
        },
        25: {
          a: "#{b}'s army is on the verge of collapse — victory is near for #{a}!",
          b: "#{a}'s forces are crumbling — #{b} smells victory!",
        },
      },
    },
    ambientDamage: { min: 1, max: 3 },
    diceFormula: "1d20",
    roundCounter: 0,
  };
}

// ── Data Access ────────────────────────────────────────────────────────────────

function getBattleState() {
  const state = game.settings.get(MODULE_ID, FLAG_KEY) ?? defaultBattleState();
  // Ensure crossedThresholds exists for states saved before this field was added
  if (!state.crossedThresholds) {
    state.crossedThresholds = { a: [], b: [] };
  }
  return state;
}

async function setBattleState(state) {
  await game.settings.set(MODULE_ID, FLAG_KEY, state);
  game.socket.emit(SOCKET_NAME, { action: "refresh" });
  refreshAllUIs();
}

function refreshAllUIs() {
  if (gmAppInstance) gmAppInstance.render();
  if (hudInstance) hudInstance.render();
}

// ── Utility ────────────────────────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function replaceFactionNames(text, state) {
  return text
    .replace(/#{a}/g, state.factions.a.name)
    .replace(/#{b}/g, state.factions.b.name);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTotalModifier(faction) {
  return faction.modifiers.reduce((sum, m) => sum + m.value, 0);
}

function getStatusText(state) {
  const { a, b } = state.factions;
  if (!a || !b) return "No battle in progress.";
  const aPct = a.hp / a.maxHp;
  const bPct = b.hp / b.maxHp;
  if (!state.active) return "No battle in progress.";
  if (a.hp <= 0) return `${escapeHtml(b.name)} is victorious!`;
  if (b.hp <= 0) return `${escapeHtml(a.name)} is victorious!`;
  const diff = aPct - bPct;
  if (Math.abs(diff) < 0.1) return "The battle hangs in the balance.";
  if (diff > 0.3) return `${escapeHtml(a.name)}'s forces press the advantage!`;
  if (diff > 0.1) return `${escapeHtml(a.name)}'s forces gain ground.`;
  if (diff < -0.3) return `${escapeHtml(b.name)}'s forces press the advantage!`;
  if (diff < -0.1) return `${escapeHtml(b.name)}'s forces gain ground.`;
  return "The battle rages on.";
}

// ── Victory Handling ──────────────────────────────────────────────────────────

function checkVictory(state) {
  const { a, b } = state.factions;
  if (a.hp <= 0 && b.hp > 0) {
    postVictoryCard(b.name, a.name, state);
  } else if (b.hp <= 0 && a.hp > 0) {
    postVictoryCard(a.name, b.name, state);
  }
}

function postVictoryCard(winnerName, loserName, state) {
  const safeWinner = escapeHtml(winnerName);
  const safeLoser = escapeHtml(loserName);
  const chatContent = `
    <div class="dlbt-chat-card dlbt-victory">
      <h3><i class="fas fa-crown"></i> Victory!</h3>
      <p class="dlbt-narrative">${safeWinner} has defeated ${safeLoser}!</p>
      <p class="dlbt-victory-subtitle">The battle of <strong>${escapeHtml(state.name)}</strong> is over after ${state.roundCounter} rounds.</p>
    </div>`;
  ChatMessage.create({
    content: chatContent,
    speaker: { alias: "Battle Tracker" },
  });
  state.eventLog.push(`🏆 VICTORY: ${winnerName} has defeated ${loserName}!`);
}

// ── Ambient Battle Roll ────────────────────────────────────────────────────────

async function doAmbientRoll() {
  const state = getBattleState();
  if (!state.active || state.factions.a.hp <= 0 || state.factions.b.hp <= 0) return;

  const modA = getTotalModifier(state.factions.a);
  const modB = getTotalModifier(state.factions.b);
  const formula = state.diceFormula || "1d20";

  // Build roll formulas with modifiers baked in so they show in the dice results
  const formulaA = modA !== 0 ? `${formula} + ${modA}` : formula;
  const formulaB = modB !== 0 ? `${formula} + ${modB}` : formula;

  // Use Foundry Roll class — toMessage() triggers dice sounds and shows in dice log
  const rollObjA = await new Roll(formulaA).evaluate();
  const rollObjB = await new Roll(formulaB).evaluate();
  const rollA = rollObjA.total;
  const rollB = rollObjB.total;

  // Post the rolls as messages to trigger dice sounds and show full breakdown
  await rollObjA.toMessage({
    speaker: { alias: `${state.factions.a.name}` },
    flavor: `${state.factions.a.name} battle roll`,
  }, { rollMode: "publicroll" });
  await rollObjB.toMessage({
    speaker: { alias: `${state.factions.b.name}` },
    flavor: `${state.factions.b.name} battle roll`,
  }, { rollMode: "publicroll" });

  const dmgMin = state.ambientDamage.min;
  const dmgMax = state.ambientDamage.max;
  const dmgRoll = await new Roll(`1d${dmgMax - dmgMin + 1} + ${dmgMin - 1}`).evaluate();
  const dmg = dmgRoll.total;

  let narrative;
  let logEntry;
  state.roundCounter++;

  const safeNameA = escapeHtml(state.factions.a.name);
  const safeNameB = escapeHtml(state.factions.b.name);

  if (rollA > rollB) {
    state.factions.b.hp = clamp(state.factions.b.hp - dmg, 0, state.factions.b.maxHp);
    narrative = replaceFactionNames(pickRandom(state.eventTables.aWins), state);
    logEntry = `Round ${state.roundCounter}: ${narrative} (${state.factions.a.name} ${rollA} vs ${rollB}, −${dmg} to ${state.factions.b.name})`;
  } else if (rollB > rollA) {
    state.factions.a.hp = clamp(state.factions.a.hp - dmg, 0, state.factions.a.maxHp);
    narrative = replaceFactionNames(pickRandom(state.eventTables.bWins), state);
    logEntry = `Round ${state.roundCounter}: ${narrative} (${state.factions.b.name} ${rollB} vs ${rollA}, −${dmg} to ${state.factions.a.name})`;
  } else {
    narrative = replaceFactionNames(pickRandom(state.eventTables.stalemate), state);
    logEntry = `Round ${state.roundCounter}: ${narrative} (Tied at ${rollA})`;
  }

  state.eventLog.push(logEntry);
  if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);

  // Check thresholds then victory
  checkThresholds(state);
  checkVictory(state);

  await setBattleState(state);

  // Post to chat
  const safeNarrative = escapeHtml(narrative);
  const chatContent = `
    <div class="dlbt-chat-card">
      <h3><i class="fas fa-khanda"></i> Battlefield Report — Round ${state.roundCounter}</h3>
      <p class="dlbt-narrative">${safeNarrative}</p>
      <p class="dlbt-rolls">${safeNameA}: <strong>${rollA}</strong> vs ${safeNameB}: <strong>${rollB}</strong></p>
    </div>`;
  ChatMessage.create({
    content: chatContent,
    speaker: { alias: "Battle Tracker" },
  });
}

function checkThresholds(state) {
  const thresholds = state.eventTables.thresholds;
  if (!state.crossedThresholds) state.crossedThresholds = { a: [], b: [] };

  for (const pctStr of Object.keys(thresholds)) {
    const pct = Number(pctStr);
    const aPct = (state.factions.a.hp / state.factions.a.maxHp) * 100;
    const bPct = (state.factions.b.hp / state.factions.b.maxHp) * 100;

    // Check if faction B crossed below this threshold (faction A is winning)
    if (bPct <= pct && !state.crossedThresholds.b.includes(pct)) {
      state.crossedThresholds.b.push(pct);
      const msg = replaceFactionNames(thresholds[pctStr].a, state);
      state.eventLog.push(`⚔ THRESHOLD: ${msg}`);
      ChatMessage.create({
        content: `<div class="dlbt-chat-card dlbt-threshold"><h3><i class="fas fa-exclamation-triangle"></i> Turning Point!</h3><p>${escapeHtml(msg)}</p></div>`,
        speaker: { alias: "Battle Tracker" },
      });
    }

    // Check if faction A crossed below this threshold (faction B is winning)
    if (aPct <= pct && !state.crossedThresholds.a.includes(pct)) {
      state.crossedThresholds.a.push(pct);
      const msg = replaceFactionNames(thresholds[pctStr].b, state);
      state.eventLog.push(`⚔ THRESHOLD: ${msg}`);
      ChatMessage.create({
        content: `<div class="dlbt-chat-card dlbt-threshold"><h3><i class="fas fa-exclamation-triangle"></i> Turning Point!</h3><p>${escapeHtml(msg)}</p></div>`,
        speaker: { alias: "Battle Tracker" },
      });
    }
  }
}

// ── Player HUD ─────────────────────────────────────────────────────────────────

class BattleHUD {
  constructor() {
    this.element = null;
    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onResize = this._debounce(() => this._applyPosition(), 200);
  }

  _debounce(fn, ms) {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  _getSavedPosition() {
    const stored = game.user.getFlag(MODULE_ID, "hudPosition");
    return stored ?? null;
  }

  async _savePosition(left, top) {
    await game.user.setFlag(MODULE_ID, "hudPosition", { left, top });
  }

  _applyPosition() {
    if (!this.element) return;
    const pos = this._getSavedPosition();
    if (pos) {
      const maxLeft = window.innerWidth - this.element.offsetWidth;
      const maxTop = window.innerHeight - this.element.offsetHeight;
      this.element.style.left = `${clamp(pos.left, 0, maxLeft)}px`;
      this.element.style.top = `${clamp(pos.top, 0, maxTop)}px`;
      this.element.style.bottom = "auto";
      this.element.style.transform = "none";
    }
  }

  _initDrag() {
    if (!this.element) return;
    // Use event delegation on the persistent element — only set up once
    this.element.addEventListener("mousedown", (e) => {
      const handle = e.target.closest(".dlbt-hud-drag-handle");
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      this._dragging = true;
      const rect = this.element.getBoundingClientRect();
      this._dragOffset.x = e.clientX - rect.left;
      this._dragOffset.y = e.clientY - rect.top;
      this.element.classList.add("dlbt-hud-dragging");
      document.addEventListener("mousemove", this._onMouseMove);
      document.addEventListener("mouseup", this._onMouseUp);
    });
  }

  _onMouseMove(e) {
    if (!this._dragging || !this.element) return;
    const left = e.clientX - this._dragOffset.x;
    const top = e.clientY - this._dragOffset.y;
    const maxLeft = window.innerWidth - this.element.offsetWidth;
    const maxTop = window.innerHeight - this.element.offsetHeight;
    this.element.style.left = `${clamp(left, 0, maxLeft)}px`;
    this.element.style.top = `${clamp(top, 0, maxTop)}px`;
    this.element.style.bottom = "auto";
    this.element.style.transform = "none";
  }

  _onMouseUp(e) {
    if (!this._dragging || !this.element) return;
    this._dragging = false;
    this.element.classList.remove("dlbt-hud-dragging");
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    const rect = this.element.getBoundingClientRect();
    this._savePosition(rect.left, rect.top);
  }

  render() {
    const state = getBattleState();

    // Hide HUD from the primary GM — they use the GM app instead.
    // Assistant GMs (isGM but not the active primaryGM) still see the HUD.
    const isPrimaryGM = game.user.isGM && game.user === game.users.activeGM;
    if (!state.active || isPrimaryGM) {
      this.remove();
      return;
    }

    const isNew = !this.element;
    if (isNew) {
      this.element = document.createElement("div");
      this.element.id = "dlbt-hud";
      this.element.classList.add("dlbt-hud");
      document.body.appendChild(this.element);
      this._initDrag();
      window.addEventListener("resize", this._onResize);
    }

    const aPct = Math.round((state.factions.a.hp / state.factions.a.maxHp) * 100);
    const bPct = Math.round((state.factions.b.hp / state.factions.b.maxHp) * 100);
    const status = getStatusText(state);

    // Tug-of-war bar: relative strength determines split position
    const total = aPct + bPct;
    const aBarWidth = total > 0 ? (aPct / total) * 100 : 50;
    const bBarWidth = total > 0 ? (bPct / total) * 100 : 50;

    const safeNameA = escapeHtml(state.factions.a.name);
    const safeNameB = escapeHtml(state.factions.b.name);

    this.element.innerHTML = `
      <div class="dlbt-hud-drag-handle" title="Drag to move">
        <i class="fas fa-grip-horizontal"></i>
      </div>
      <div class="dlbt-hud-inner">
        <div class="dlbt-hud-faction dlbt-hud-faction-a">
          <span class="dlbt-hud-name">${safeNameA}</span>
          <span class="dlbt-hud-pct">${aPct}%</span>
        </div>
        <div class="dlbt-hud-bar-container">
          <div class="dlbt-hud-bar-a" style="width: ${aBarWidth}%; background: ${state.factions.a.color};"></div>
          <div class="dlbt-hud-bar-b" style="width: ${bBarWidth}%; background: ${state.factions.b.color};"></div>
        </div>
        <div class="dlbt-hud-faction dlbt-hud-faction-b">
          <span class="dlbt-hud-pct">${bPct}%</span>
          <span class="dlbt-hud-name">${safeNameB}</span>
        </div>
      </div>
      <div class="dlbt-hud-status">${status}</div>
    `;

    if (isNew) {
      requestAnimationFrame(() => this._applyPosition());
    }
  }

  remove() {
    if (this.element) {
      document.removeEventListener("mousemove", this._onMouseMove);
      document.removeEventListener("mouseup", this._onMouseUp);
      window.removeEventListener("resize", this._onResize);
      this.element.remove();
      this.element = null;
    }
  }
}

// ── Presets ────────────────────────────────────────────────────────────────────

function getPresets() {
  return game.settings.get(MODULE_ID, PRESETS_KEY) ?? [];
}

async function savePreset(presetName, state) {
  const presets = getPresets();
  const preset = {
    name: presetName,
    factions: {
      a: { name: state.factions.a.name, color: state.factions.a.color, maxHp: state.factions.a.maxHp },
      b: { name: state.factions.b.name, color: state.factions.b.color, maxHp: state.factions.b.maxHp },
    },
    ambientDamage: { ...state.ambientDamage },
    diceFormula: state.diceFormula || "1d20",
    eventTables: structuredClone(state.eventTables),
  };
  // Replace if same name exists
  const existingIdx = presets.findIndex((p) => p.name === presetName);
  if (existingIdx >= 0) {
    presets[existingIdx] = preset;
  } else {
    presets.push(preset);
  }
  await game.settings.set(MODULE_ID, PRESETS_KEY, presets);
}

async function deletePreset(presetName) {
  const presets = getPresets().filter((p) => p.name !== presetName);
  await game.settings.set(MODULE_ID, PRESETS_KEY, presets);
}

// ── GM Application ─────────────────────────────────────────────────────────────

class BattleTrackerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "dorman-lakelys-battle-tracker",
    classes: ["dlbt-app"],
    tag: "div",
    window: {
      title: "Dorman Lakely's Battle Tracker",
      icon: "fas fa-khanda",
      resizable: true,
    },
    position: {
      width: 520,
      height: "auto",
    },
    actions: {
      startBattle: BattleTrackerApp._onStartBattle,
      endBattle: BattleTrackerApp._onEndBattle,
      advanceRound: BattleTrackerApp._onAdvanceRound,
      shiftMorale: BattleTrackerApp._onShiftMorale,
      addModifier: BattleTrackerApp._onAddModifier,
      removeModifier: BattleTrackerApp._onRemoveModifier,
      editEventTables: BattleTrackerApp._onEditEventTables,
      toggleLog: BattleTrackerApp._onToggleLog,
      savePreset: BattleTrackerApp._onSavePreset,
      loadPreset: BattleTrackerApp._onLoadPreset,
      deletePreset: BattleTrackerApp._onDeletePreset,
      showHelp: BattleTrackerApp._onShowHelp,
      editBattle: BattleTrackerApp._onEditBattle,
    },
  };

  get title() {
    return "Dorman Lakely's Battle Tracker";
  }

  async _renderHTML(_context, _options) {
    const container = document.createElement("div");
    container.classList.add("dlbt-container");
    const state = getBattleState();

    if (!state.active) {
      container.innerHTML = this._renderSetup(state);
    } else {
      container.innerHTML = this._renderBattle(state);
    }
    return container;
  }

  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
    this._activateListeners(result);
  }

  _activateListeners(html) {
    const setupForm = html.querySelector(".dlbt-setup-form");
    if (setupForm) {
      setupForm.addEventListener("submit", (e) => e.preventDefault());
    }

    // Preset selector change handler
    const presetSelect = html.querySelector(".dlbt-preset-select");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        const presetName = e.target.value;
        if (!presetName) return;
        const presets = getPresets();
        const preset = presets.find((p) => p.name === presetName);
        if (!preset) return;
        const form = html.querySelector(".dlbt-setup-form");
        if (!form) return;
        form.querySelector('[name="battleName"]').value = preset.name;
        form.querySelector('[name="factionAName"]').value = preset.factions.a.name;
        form.querySelector('[name="factionAHp"]').value = preset.factions.a.maxHp;
        form.querySelector('[name="factionAColor"]').value = preset.factions.a.color;
        form.querySelector('[name="factionBName"]').value = preset.factions.b.name;
        form.querySelector('[name="factionBHp"]').value = preset.factions.b.maxHp;
        form.querySelector('[name="factionBColor"]').value = preset.factions.b.color;
        form.querySelector('[name="ambientMin"]').value = preset.ambientDamage.min;
        form.querySelector('[name="ambientMax"]').value = preset.ambientDamage.max;
        if (preset.diceFormula) {
          form.querySelector('[name="diceFormula"]').value = preset.diceFormula;
        }
      });
    }
  }

  // ── Setup Screen ──

  _renderSetup(state) {
    const presets = getPresets();
    const presetOptions = presets
      .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
      .join("");
    const presetSection = presets.length
      ? `<div class="dlbt-field dlbt-preset-row">
           <label>Load Preset</label>
           <div class="dlbt-field-row">
             <select class="dlbt-preset-select"><option value="">— Select Preset —</option>${presetOptions}</select>
             <button type="button" data-action="deletePreset" class="dlbt-btn dlbt-btn-sm" title="Delete selected preset"><i class="fas fa-trash"></i></button>
           </div>
         </div>`
      : "";

    return `
      <div class="dlbt-setup">
        <h2><i class="fas fa-shield-alt"></i> Configure New Battle</h2>
        ${presetSection}
        <form class="dlbt-setup-form">
          <div class="dlbt-field">
            <label>Battle Name</label>
            <input type="text" name="battleName" value="${escapeHtml(state.name)}" placeholder="The Battle of Kaupbrú" />
          </div>
          <fieldset class="dlbt-faction-setup">
            <legend style="color: ${state.factions.a.color}"><i class="fas fa-flag"></i> Faction A</legend>
            <div class="dlbt-field">
              <label>Name</label>
              <input type="text" name="factionAName" value="${escapeHtml(state.factions.a.name)}" />
            </div>
            <div class="dlbt-field-row">
              <div class="dlbt-field">
                <label>Morale HP</label>
                <input type="number" name="factionAHp" value="${state.factions.a.maxHp}" min="10" max="500" />
              </div>
              <div class="dlbt-field">
                <label>Color</label>
                <input type="color" name="factionAColor" value="${state.factions.a.color}" />
              </div>
            </div>
          </fieldset>
          <fieldset class="dlbt-faction-setup">
            <legend style="color: ${state.factions.b.color}"><i class="fas fa-flag"></i> Faction B</legend>
            <div class="dlbt-field">
              <label>Name</label>
              <input type="text" name="factionBName" value="${escapeHtml(state.factions.b.name)}" />
            </div>
            <div class="dlbt-field-row">
              <div class="dlbt-field">
                <label>Morale HP</label>
                <input type="number" name="factionBHp" value="${state.factions.b.maxHp}" min="10" max="500" />
              </div>
              <div class="dlbt-field">
                <label>Color</label>
                <input type="color" name="factionBColor" value="${state.factions.b.color}" />
              </div>
            </div>
          </fieldset>
          <div class="dlbt-field-row">
            <div class="dlbt-field">
              <label>Dice Formula</label>
              <select name="diceFormula">
                <option value="1d20" ${state.diceFormula === "1d20" ? "selected" : ""}>1d20 (Swingy)</option>
                <option value="3d6" ${state.diceFormula === "3d6" ? "selected" : ""}>3d6 (Bell Curve)</option>
                <option value="2d10" ${state.diceFormula === "2d10" ? "selected" : ""}>2d10 (Moderate)</option>
                <option value="1d12" ${state.diceFormula === "1d12" ? "selected" : ""}>1d12 (Compact)</option>
                <option value="4d6" ${state.diceFormula === "4d6" ? "selected" : ""}>4d6 (Stable)</option>
              </select>
            </div>
          </div>
          <div class="dlbt-field-row">
            <div class="dlbt-field">
              <label>Ambient Dmg Min</label>
              <input type="number" name="ambientMin" value="${state.ambientDamage.min}" min="0" max="20" />
            </div>
            <div class="dlbt-field">
              <label>Ambient Dmg Max</label>
              <input type="number" name="ambientMax" value="${state.ambientDamage.max}" min="1" max="20" />
            </div>
          </div>
          <button type="button" data-action="startBattle" class="dlbt-btn dlbt-btn-start">
            <i class="fas fa-khanda"></i> Begin Battle
          </button>
          <button type="button" data-action="showHelp" class="dlbt-btn dlbt-btn-help">
            <i class="fas fa-question-circle"></i> How Does This Work?
          </button>
        </form>
      </div>`;
  }

  // ── Active Battle Screen ──

  _renderBattle(state) {
    const aPct = Math.round((state.factions.a.hp / state.factions.a.maxHp) * 100);
    const bPct = Math.round((state.factions.b.hp / state.factions.b.maxHp) * 100);
    const status = getStatusText(state);

    const safeNameA = escapeHtml(state.factions.a.name);
    const safeNameB = escapeHtml(state.factions.b.name);

    const modListA = state.factions.a.modifiers
      .map(
        (m, i) =>
          `<span class="dlbt-mod-tag">${escapeHtml(m.name)}: ${m.value > 0 ? "+" : ""}${m.value} <a data-action="removeModifier" data-faction="a" data-index="${i}">✕</a></span>`
      )
      .join("");

    const modListB = state.factions.b.modifiers
      .map(
        (m, i) =>
          `<span class="dlbt-mod-tag">${escapeHtml(m.name)}: ${m.value > 0 ? "+" : ""}${m.value} <a data-action="removeModifier" data-faction="b" data-index="${i}">✕</a></span>`
      )
      .join("");

    const logHtml = state.eventLog
      .slice(-15)
      .reverse()
      .map((e) => `<div class="dlbt-log-entry">${escapeHtml(e)}</div>`)
      .join("");

    return `
      <div class="dlbt-battle">
        <h2><i class="fas fa-khanda"></i> ${escapeHtml(state.name)} — Round ${state.roundCounter}</h2>
        <button data-action="advanceRound" class="dlbt-btn dlbt-btn-advance">
          <i class="fas fa-dice-d20"></i> Advance Battle Round (to Round ${state.roundCounter + 1})
        </button>
        <div class="dlbt-status-text">${status}</div>

        <!-- Morale Bar Preview -->
        <div class="dlbt-bar-preview">
          <div class="dlbt-bar-label-left">${safeNameA} (${state.factions.a.hp}/${state.factions.a.maxHp})</div>
          <div class="dlbt-bar-label-right">${safeNameB} (${state.factions.b.hp}/${state.factions.b.maxHp})</div>
          <div class="dlbt-bar-track">
            <div class="dlbt-bar-fill-a" style="width:${aPct}%; background:${state.factions.a.color};"></div>
            <div class="dlbt-bar-fill-b" style="width:${bPct}%; background:${state.factions.b.color};"></div>
          </div>
        </div>

        <!-- Faction Columns -->
        <div class="dlbt-factions-row">
          <div class="dlbt-faction-col">
            <h3 style="color:${state.factions.a.color}">${safeNameA}</h3>
            <div class="dlbt-modifiers">${modListA || "<em>No modifiers</em>"}</div>
            <div class="dlbt-mod-add">
              <input type="text" placeholder="Modifier name" class="dlbt-mod-name" data-faction="a" />
              <input type="number" value="1" class="dlbt-mod-val" data-faction="a" min="-10" max="10" />
              <button data-action="addModifier" data-faction="a"><i class="fas fa-plus"></i></button>
            </div>
            <div class="dlbt-shift-section">
              <label class="dlbt-shift-label">Shift Morale:</label>
              <div class="dlbt-shift-btns">
                <button data-action="shiftMorale" data-faction="a" data-amount="-5">−5</button>
                <button data-action="shiftMorale" data-faction="a" data-amount="-2">−2</button>
                <button data-action="shiftMorale" data-faction="a" data-amount="-1">−1</button>
                <button data-action="shiftMorale" data-faction="a" data-amount="1">+1</button>
                <button data-action="shiftMorale" data-faction="a" data-amount="2">+2</button>
                <button data-action="shiftMorale" data-faction="a" data-amount="5">+5</button>
              </div>
            </div>
          </div>
          <div class="dlbt-faction-col">
            <h3 style="color:${state.factions.b.color}">${safeNameB}</h3>
            <div class="dlbt-modifiers">${modListB || "<em>No modifiers</em>"}</div>
            <div class="dlbt-mod-add">
              <input type="text" placeholder="Modifier name" class="dlbt-mod-name" data-faction="b" />
              <input type="number" value="1" class="dlbt-mod-val" data-faction="b" min="-10" max="10" />
              <button data-action="addModifier" data-faction="b"><i class="fas fa-plus"></i></button>
            </div>
            <div class="dlbt-shift-section">
              <label class="dlbt-shift-label">Shift Morale:</label>
              <div class="dlbt-shift-btns">
                <button data-action="shiftMorale" data-faction="b" data-amount="-5">−5</button>
                <button data-action="shiftMorale" data-faction="b" data-amount="-2">−2</button>
                <button data-action="shiftMorale" data-faction="b" data-amount="-1">−1</button>
                <button data-action="shiftMorale" data-faction="b" data-amount="1">+1</button>
                <button data-action="shiftMorale" data-faction="b" data-amount="2">+2</button>
                <button data-action="shiftMorale" data-faction="b" data-amount="5">+5</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="dlbt-controls">
          <button data-action="editBattle" class="dlbt-btn dlbt-btn-fill"><i class="fas fa-pen"></i> Edit Battle</button>
          <button data-action="editEventTables" class="dlbt-btn dlbt-btn-fill"><i class="fas fa-table"></i> Event Tables</button>
          <button data-action="savePreset" class="dlbt-btn dlbt-btn-fill"><i class="fas fa-save"></i> Save Preset</button>
          <button data-action="showHelp" class="dlbt-btn dlbt-btn-fill"><i class="fas fa-question-circle"></i> Help</button>
        </div>

        <!-- Event Log -->
        <div class="dlbt-log-section">
          <h3 data-action="toggleLog" style="cursor:pointer"><i class="fas fa-scroll"></i> Battle Log ▾</h3>
          <div class="dlbt-log">${logHtml || "<em>No events yet.</em>"}</div>
        </div>

        <!-- End Battle -->
        <button data-action="endBattle" class="dlbt-btn dlbt-btn-danger dlbt-btn-end">
          <i class="fas fa-skull"></i> End Battle
        </button>
      </div>`;
  }

  // ── Actions ──

  static async _onStartBattle(event, target) {
    const form = this.element.querySelector(".dlbt-setup-form");
    const state = defaultBattleState();
    state.active = true;
    state.name = form.querySelector('[name="battleName"]').value || "Battle";
    state.factions.a.name = form.querySelector('[name="factionAName"]').value || "Faction A";
    state.factions.a.maxHp = Number(form.querySelector('[name="factionAHp"]').value) || 50;
    state.factions.a.hp = state.factions.a.maxHp;
    state.factions.a.color = form.querySelector('[name="factionAColor"]').value;
    state.factions.b.name = form.querySelector('[name="factionBName"]').value || "Faction B";
    state.factions.b.maxHp = Number(form.querySelector('[name="factionBHp"]').value) || 50;
    state.factions.b.hp = state.factions.b.maxHp;
    state.factions.b.color = form.querySelector('[name="factionBColor"]').value;
    state.ambientDamage.min = Number(form.querySelector('[name="ambientMin"]').value) || 1;
    state.ambientDamage.max = Number(form.querySelector('[name="ambientMax"]').value) || 3;
    state.diceFormula = form.querySelector('[name="diceFormula"]').value || "1d20";

    // Load event tables from preset if one was selected
    const presetSelect = this.element.querySelector(".dlbt-preset-select");
    if (presetSelect?.value) {
      const presets = getPresets();
      const preset = presets.find((p) => p.name === presetSelect.value);
      if (preset?.eventTables) {
        state.eventTables = structuredClone(preset.eventTables);
      }
    }

    await setBattleState(state);
    ui.notifications.info(`Battle started: ${state.name}`);
  }

  static async _onEndBattle(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "End Battle" },
      content: "<p>End the current battle? This will hide the player HUD and clear all state.</p>",
    });
    if (!confirmed) return;
    const state = defaultBattleState();
    await setBattleState(state);
    ui.notifications.info("Battle ended.");
  }

  static async _onAdvanceRound(event, target) {
    await doAmbientRoll();
  }

  static async _onShiftMorale(event, target) {
    const faction = target.dataset.faction;
    const amount = Number(target.dataset.amount);
    const state = getBattleState();
    state.factions[faction].hp = clamp(
      state.factions[faction].hp + amount,
      0,
      state.factions[faction].maxHp
    );
    const direction = amount > 0 ? "gained" : "lost";
    state.eventLog.push(
      `GM: ${state.factions[faction].name} ${direction} ${Math.abs(amount)} morale (now ${state.factions[faction].hp}/${state.factions[faction].maxHp})`
    );
    checkThresholds(state);
    checkVictory(state);
    await setBattleState(state);
  }

  static async _onAddModifier(event, target) {
    const faction = target.dataset.faction;
    const nameInput = this.element.querySelector(`.dlbt-mod-name[data-faction="${faction}"]`);
    const valInput = this.element.querySelector(`.dlbt-mod-val[data-faction="${faction}"]`);
    const name = nameInput.value.trim();
    const value = Number(valInput.value) || 0;
    if (!name) return ui.notifications.warn("Enter a modifier name.");
    const state = getBattleState();
    state.factions[faction].modifiers.push({ name, value });
    state.eventLog.push(`GM: Added modifier "${name}" (${value > 0 ? "+" : ""}${value}) to ${state.factions[faction].name}`);
    await setBattleState(state);
  }

  static async _onRemoveModifier(event, target) {
    const faction = target.dataset.faction;
    const index = Number(target.dataset.index);
    const state = getBattleState();
    const removed = state.factions[faction].modifiers.splice(index, 1);
    if (removed.length) {
      state.eventLog.push(`GM: Removed modifier "${removed[0].name}" from ${state.factions[faction].name}`);
    }
    await setBattleState(state);
  }

  static async _onEditEventTables(event, target) {
    const state = getBattleState();
    const tables = state.eventTables;
    const safeNameA = escapeHtml(state.factions.a.name);
    const safeNameB = escapeHtml(state.factions.b.name);

    const content = `
      <p>Edit the narrative event tables (one event per line). Use <code>#{a}</code> and <code>#{b}</code> as faction name placeholders.</p>
      <div style="margin-bottom:8px">
        <label><strong>${safeNameA} Wins:</strong></label>
        <textarea name="aWins" rows="5" style="width:100%">${escapeHtml(tables.aWins.join("\n"))}</textarea>
      </div>
      <div style="margin-bottom:8px">
        <label><strong>${safeNameB} Wins:</strong></label>
        <textarea name="bWins" rows="5" style="width:100%">${escapeHtml(tables.bWins.join("\n"))}</textarea>
      </div>
      <div style="margin-bottom:8px">
        <label><strong>Stalemate:</strong></label>
        <textarea name="stalemate" rows="4" style="width:100%">${escapeHtml(tables.stalemate.join("\n"))}</textarea>
      </div>
      <hr/>
      <p><strong>Threshold Events</strong> — Triggered when a faction drops below a morale percentage.</p>
      <div style="margin-bottom:8px">
        <label><strong>75% — When ${safeNameA} is winning:</strong></label>
        <input type="text" name="thresh75a" value="${escapeHtml(tables.thresholds[75]?.a || "")}" style="width:100%" />
      </div>
      <div style="margin-bottom:8px">
        <label><strong>75% — When ${safeNameB} is winning:</strong></label>
        <input type="text" name="thresh75b" value="${escapeHtml(tables.thresholds[75]?.b || "")}" style="width:100%" />
      </div>
      <div style="margin-bottom:8px">
        <label><strong>50% — When ${safeNameA} is winning:</strong></label>
        <input type="text" name="thresh50a" value="${escapeHtml(tables.thresholds[50]?.a || "")}" style="width:100%" />
      </div>
      <div style="margin-bottom:8px">
        <label><strong>50% — When ${safeNameB} is winning:</strong></label>
        <input type="text" name="thresh50b" value="${escapeHtml(tables.thresholds[50]?.b || "")}" style="width:100%" />
      </div>
      <div style="margin-bottom:8px">
        <label><strong>25% — When ${safeNameA} is winning:</strong></label>
        <input type="text" name="thresh25a" value="${escapeHtml(tables.thresholds[25]?.a || "")}" style="width:100%" />
      </div>
      <div style="margin-bottom:8px">
        <label><strong>25% — When ${safeNameB} is winning:</strong></label>
        <input type="text" name="thresh25b" value="${escapeHtml(tables.thresholds[25]?.b || "")}" style="width:100%" />
      </div>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Edit Event Tables" },
      content,
      ok: {
        label: "Save",
        callback: (event, button, dialog) => {
          const f = button.form.elements;
          return {
            aWins: f.aWins.value.split("\n").filter((s) => s.trim()),
            bWins: f.bWins.value.split("\n").filter((s) => s.trim()),
            stalemate: f.stalemate.value.split("\n").filter((s) => s.trim()),
            thresholds: {
              75: { a: f.thresh75a.value, b: f.thresh75b.value },
              50: { a: f.thresh50a.value, b: f.thresh50b.value },
              25: { a: f.thresh25a.value, b: f.thresh25b.value },
            },
          };
        },
      },
    });

    if (result) {
      state.eventTables.aWins = result.aWins;
      state.eventTables.bWins = result.bWins;
      state.eventTables.stalemate = result.stalemate;
      state.eventTables.thresholds = result.thresholds;
      await setBattleState(state);
      ui.notifications.info("Event tables updated.");
    }
  }

  static _onToggleLog(event, target) {
    const log = target.closest(".dlbt-log-section")?.querySelector(".dlbt-log");
    if (log) log.style.display = log.style.display === "none" ? "block" : "none";
  }

  static async _onSavePreset(event, target) {
    const state = getBattleState();
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Save Battle Preset" },
      content: `<div style="margin-bottom:8px"><label><strong>Preset Name:</strong></label><input type="text" name="presetName" value="${escapeHtml(state.name)}" style="width:100%" /></div>`,
      ok: {
        label: "Save",
        callback: (event, button, dialog) => button.form.elements.presetName.value.trim(),
      },
    });
    if (result) {
      await savePreset(result, state);
      ui.notifications.info(`Preset "${result}" saved.`);
    }
  }

  static async _onLoadPreset(event, target) {
    // Handled via the select change listener in _activateListeners
  }

  static async _onDeletePreset(event, target) {
    const select = this.element.querySelector(".dlbt-preset-select");
    const presetName = select?.value;
    if (!presetName) return ui.notifications.warn("Select a preset to delete.");
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Preset" },
      content: `<p>Delete preset "${escapeHtml(presetName)}"?</p>`,
    });
    if (!confirmed) return;
    await deletePreset(presetName);
    this.render({ force: true });
    ui.notifications.info(`Preset "${presetName}" deleted.`);
  }

  static async _onEditBattle(event, target) {
    const state = getBattleState();
    const diceOptions = ["1d20", "3d6", "2d10", "1d12", "4d6"];
    const diceSelect = diceOptions
      .map((d) => `<option value="${d}" ${state.diceFormula === d ? "selected" : ""}>${d}</option>`)
      .join("");

    const content = `
      <div style="margin-bottom:8px">
        <label><strong>Battle Name:</strong></label>
        <input type="text" name="battleName" value="${escapeHtml(state.name)}" style="width:100%" />
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <div style="flex:1">
          <label><strong>${escapeHtml(state.factions.a.name)} — Name:</strong></label>
          <input type="text" name="factionAName" value="${escapeHtml(state.factions.a.name)}" style="width:100%" />
        </div>
        <div style="width:60px">
          <label><strong>Color:</strong></label>
          <input type="color" name="factionAColor" value="${state.factions.a.color}" />
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <div style="flex:1">
          <label><strong>${escapeHtml(state.factions.b.name)} — Name:</strong></label>
          <input type="text" name="factionBName" value="${escapeHtml(state.factions.b.name)}" style="width:100%" />
        </div>
        <div style="width:60px">
          <label><strong>Color:</strong></label>
          <input type="color" name="factionBColor" value="${state.factions.b.color}" />
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <div style="flex:1">
          <label><strong>Dice Formula:</strong></label>
          <select name="diceFormula" style="width:100%">${diceSelect}</select>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px">
        <div style="flex:1">
          <label><strong>Ambient Dmg Min:</strong></label>
          <input type="number" name="ambientMin" value="${state.ambientDamage.min}" min="0" max="20" style="width:100%" />
        </div>
        <div style="flex:1">
          <label><strong>Ambient Dmg Max:</strong></label>
          <input type="number" name="ambientMax" value="${state.ambientDamage.max}" min="1" max="20" style="width:100%" />
        </div>
      </div>`;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Edit Battle Settings" },
      content,
      ok: {
        label: "Save Changes",
        callback: (event, button, dialog) => {
          const f = button.form.elements;
          return {
            name: f.battleName.value.trim() || state.name,
            factionAName: f.factionAName.value.trim() || state.factions.a.name,
            factionAColor: f.factionAColor.value,
            factionBName: f.factionBName.value.trim() || state.factions.b.name,
            factionBColor: f.factionBColor.value,
            diceFormula: f.diceFormula.value,
            ambientMin: Number(f.ambientMin.value) || state.ambientDamage.min,
            ambientMax: Number(f.ambientMax.value) || state.ambientDamage.max,
          };
        },
      },
    });

    if (result) {
      state.name = result.name;
      state.factions.a.name = result.factionAName;
      state.factions.a.color = result.factionAColor;
      state.factions.b.name = result.factionBName;
      state.factions.b.color = result.factionBColor;
      state.diceFormula = result.diceFormula;
      state.ambientDamage.min = result.ambientMin;
      state.ambientDamage.max = result.ambientMax;
      await setBattleState(state);
      ui.notifications.info("Battle settings updated.");
    }
  }

  static _onShowHelp(event, target) {
    foundry.applications.api.DialogV2.prompt({
      window: { title: "Battle Tracker — Instructions" },
      content: `
        <div style="font-size:0.85rem; line-height:1.5">
          <h3 style="margin-top:0"><i class="fas fa-khanda"></i> How It Works</h3>
          <p>This module tracks a large-scale battle happening "off-screen" while your party fights normal encounters. Two armies clash via abstract <strong>morale HP pools</strong> — no need to track hundreds of NPCs.</p>

          <h4><i class="fas fa-dice-d20"></i> Advance Battle Round</h4>
          <p>Each click rolls opposed d20s (with modifiers) for both factions. The loser takes morale damage and a narrative event appears in chat. Click this at dramatically appropriate moments — after an encounter, between scenes, or whenever the war should shift.</p>

          <h4><i class="fas fa-plus-minus"></i> Shift Morale</h4>
          <p>Use the <strong>+/-</strong> buttons to manually adjust a faction's morale when the party completes (or fails) an objective. Captured a banner? +5 to their side. Lost the bridge? -3.</p>

          <h4><i class="fas fa-star"></i> Modifiers</h4>
          <p>Add named modifiers (e.g. "Captured Banner +2") that affect a faction's d20 roll on every battle round. Remove them when the advantage expires.</p>

          <h4><i class="fas fa-exclamation-triangle"></i> Turning Points</h4>
          <p>When a faction drops below <strong>75%</strong>, <strong>50%</strong>, or <strong>25%</strong> morale, a dramatic "Turning Point" chat card fires automatically. Edit the text in <strong>Event Tables</strong>.</p>

          <h4><i class="fas fa-crown"></i> Victory</h4>
          <p>When a faction hits 0 morale, a victory announcement posts to chat. The GM can narrate the aftermath, then click <strong>End Battle</strong> to reset.</p>

          <h4><i class="fas fa-save"></i> Presets</h4>
          <p>Click <strong>Save Preset</strong> during a battle to save the army configuration (names, HP, colors, event tables) for reuse. Load presets from the setup screen when starting a new battle.</p>

          <h4><i class="fas fa-eye"></i> Player HUD</h4>
          <p>Players see a draggable tug-of-war bar showing which side is winning. It appears automatically when a battle starts and disappears when it ends. The GM does not see the HUD (the GM app has its own detailed view).</p>

          <hr style="margin:1.2rem 0; border:none; border-top:1px solid rgba(255,255,255,0.15);"/>
          <p style="text-align:center; font-size:0.85rem; color:#888; margin:0;">
            More DM tools and SRD rules at
            <a href="https://dungeonmaster.guru" target="_blank" rel="noopener noreferrer"
               style="color:#6b9ed2; text-decoration:none;">dungeonmaster.guru</a>
          </p>
        </div>`,
      ok: { label: "Got It" },
    });
  }
}

// ── Hooks & Initialization ─────────────────────────────────────────────────────

let gmAppInstance = null;
let hudInstance = null;

Hooks.once("init", () => {
  logModuleHeader();

  game.settings.register(MODULE_ID, FLAG_KEY, {
    name: "Battle State",
    scope: "world",
    config: false,
    type: Object,
    default: defaultBattleState(),
  });

  game.settings.register(MODULE_ID, PRESETS_KEY, {
    name: "Battle Presets",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });
});

Hooks.once("ready", () => {
  logModuleReady();

  // Set up socket listener
  game.socket.on(SOCKET_NAME, (data) => {
    if (data.action === "refresh") refreshAllUIs();
  });

  // Initialize HUD for all users
  hudInstance = new BattleHUD();
  hudInstance.render();
});

// Foundry v13 API: controls is an object keyed by control group name, tools is also an object
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const tokenControls = controls.tokens;
  if (!tokenControls) return;
  tokenControls.tools["battle-tracker"] = {
    name: "battle-tracker",
    title: "Dorman Lakely's Battle Tracker",
    icon: "fas fa-khanda",
    button: true,
    onChange: () => {
      if (!gmAppInstance) {
        gmAppInstance = new BattleTrackerApp();
      }
      gmAppInstance.render({ force: true });
    },
  };
});

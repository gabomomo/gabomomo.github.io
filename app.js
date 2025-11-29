"use strict";

/*
  PLAN 30 DÍAS – GABO & KATHERINE

  - Usa el HTML de index.html (ids: dayName, nutritionFocus, chkGymMode, chkPadelDone, etc.).
  - Carga plan-config.json (usuarios, días, nutrición, entrenos, menús).
  - Soporta 2 usuarios: gabo y kathy.
  - Guarda progreso diario en localStorage por usuario y día.
*/
import { app, auth, db } from "./firebase-init.js";

console.log("Firebase cargado:", app);
const STORAGE_STATE = "plan30_state_v3";
const STORAGE_ACTIVE_USER = "plan30_activeUser";

// Rutinas de Gym por usuario (combinan los bloques de CONFIG.trainings)
const GYM_ROUTINES = {
  gabo: {
    A: {
      title: "Rutina A — Upper Empuje + Pierna A (Gabo)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio suave", key: "cardio_facil" },
        { label: "Upper — Empuje", key: "fuerza_upper_empuje" },
        { label: "Lower A", key: "fuerza_lower_a" },
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    },
    B: {
      title: "Rutina B — Upper Tirón + Pierna B (Gabo)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio medio", key: "cardio_medio" },
        { label: "Upper — Tirón", key: "fuerza_upper_tiron" },
        { label: "Lower B", key: "fuerza_lower_b" },
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    },
    C: {
      title: "Rutina C — Full Body (Gabo)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio intenso", key: "cardio_intenso" },
        { label: "Upper Mix", key: "fuerza_upper_empuje" },  // o mezcla
        { label: "Lower Mix", key: "fuerza_lower_a" },        // puedes elegir
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    }
  },

  kathy: {
    A: {
      title: "Rutina A — Adaptación (Katherine)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio suave", key: "cardio_facil" },
        { label: "Upper — Empuje", key: "fuerza_upper_empuje" },
        { label: "Lower A", key: "fuerza_lower_a" },
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    },
    B: {
      title: "Rutina B — Fuerza (Katherine)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio medio", key: "cardio_medio" },
        { label: "Upper — Tirón", key: "fuerza_upper_tiron" },
        { label: "Lower B", key: "fuerza_lower_b" },
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    },
    C: {
      title: "Rutina C — Intensiva (Katherine)",
      blocks: [
        { label: "Movilidad", key: "movilidad" },
        { label: "Cardio intenso", key: "cardio_intenso" },
        { label: "Upper Mix", key: "fuerza_upper_tiron" }, // a gusto
        { label: "Lower Mix", key: "fuerza_lower_b" },
        { label: "Core", key: "core" },
        { label: "Estiramientos", key: "estiramientos" }
      ]
    }
  }
};



let CONFIG = null;
let ACTIVE_USER_ID = null;
let appState = null;
let currentDayId = 1;
const TOTAL_DAYS = 30;

// ----------- Utilidades de estado ---------------------------------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE);
    if (!raw) return { users: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { users: {} };
    if (!parsed.users || typeof parsed.users !== "object") parsed.users = {};
    return parsed;
  } catch (e) {
    console.error("Error leyendo estado:", e);
    return { users: {} };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_STATE, JSON.stringify(appState));
  } catch (e) {
    console.error("Error guardando estado:", e);
  }
}

function getUserState(userId) {
  if (!appState.users[userId]) {
    appState.users[userId] = {
      profile: {},
      days: {}
    };
  }
  return appState.users[userId];
}

function getDayState(userId, dayId) {
  const u = getUserState(userId);
  const key = String(dayId);
  if (!u.days[key]) {
    u.days[key] = {
      // porciones
      portions: {
        protein: false,
        carbs: false,
        fats: false,
        veggies: false,
        fruits: false,
        dairy: false,
        whey: false
      },
      // comidas
      nutrition: {
        mealsDone: []
      },
      // entrenamiento
      training: {
        noExercise: false,
        gym: false,
        walk: false,
        alt1: false,
        alt2: false,
        gymExercisesDone: []
      },
      waterLiters: 0,
      notes: "",
      closed: false
    };
  }
  return u.days[key];
}

function getActiveUserConfig() {
  if (!CONFIG || !Array.isArray(CONFIG.users)) return null;
  return (
    CONFIG.users.find((u) => u.id === ACTIVE_USER_ID) || CONFIG.users[0] || null
  );
}

function getConfigDay(dayId) {
  if (!CONFIG || !Array.isArray(CONFIG.days) || !CONFIG.days.length) return null;

  // Número de plantillas reales en el JSON (ahora mismo 3)
  const totalTemplates = CONFIG.days.length;

  // Mapeo: 1→template 1, 2→template 2, 3→template 3,
  // 4→template 1, 5→template 2, 6→template 3, etc.
  const templateIndex = (dayId - 1) % totalTemplates;
  const templateDay = CONFIG.days[templateIndex];

  return templateDay || null;
}


function getConfigDayNutrition(configDay) {
  if (!configDay) return null;
  if (ACTIVE_USER_ID === "gabo") return configDay.nutritionGabo || null;
  return configDay.nutritionKathy || null;
}

// ----------- INIT -------------------------------------------------------

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  appState = loadState();

  // Cargar config
  try {
    const res = await fetch("plan-config.json");
    CONFIG = await res.json();
  } catch (err) {
    console.error("Error cargando plan-config.json", err);
    alert("No se pudo cargar plan-config.json");
    return;
  }

  const defaultUser =
    (CONFIG.users && CONFIG.users[0] && CONFIG.users[0].id) || "gabo";
  ACTIVE_USER_ID =
    localStorage.getItem(STORAGE_ACTIVE_USER) || defaultUser;

  initUserSelect();
  initDaySelect();
  initTabs();
  initProfileDefaults();

  const firstDay = CONFIG.days && CONFIG.days[0] ? CONFIG.days[0].id : 1;
  currentDayId = firstDay;
  document.getElementById("daySelect").value = String(firstDay);

  attachGlobalListeners();

  renderAll();
}

// ----------- Select usuario / día --------------------------------------

function initUserSelect() {
  const sel = document.getElementById("userSelect");
  if (!sel) return;
  sel.innerHTML = "";
  CONFIG.users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.label || u.id;
    sel.appendChild(opt);
  });
  sel.value = ACTIVE_USER_ID;
}

function initDaySelect() {
  const sel = document.getElementById("daySelect");
  if (!sel || !CONFIG || !Array.isArray(CONFIG.days)) return;

  sel.innerHTML = "";

  // Mostrar SIEMPRE 30 días en el selector
  for (let dayId = 1; dayId <= TOTAL_DAYS; dayId++) {
    const opt = document.createElement("option");
    opt.value = String(dayId);
    opt.textContent = `Día ${dayId}`;
    sel.appendChild(opt);
  }
}


function attachGlobalListeners() {
  const selUser = document.getElementById("userSelect");
  const selDay = document.getElementById("daySelect");
  const btnCloseDay = document.getElementById("btnCloseDay");

  // Cambio de usuario
  if (selUser) {
    selUser.addEventListener("change", () => {
      ACTIVE_USER_ID = selUser.value;
      localStorage.setItem(STORAGE_ACTIVE_USER, ACTIVE_USER_ID);
      initProfileDefaults();
      renderAll();
    });
  }

  // Cambio de día
  if (selDay) {
    selDay.addEventListener("change", () => {
      const targetDayId = parseInt(selDay.value, 10) || 1;

      // Si selecciona el mismo día, no hacemos nada
      if (targetDayId === currentDayId) return;

      // Revisar si el día actual está cerrado
      const currentState = getDayState(ACTIVE_USER_ID, currentDayId);

      if (!currentState.closed) {
        // No permitir cambio: devolver el select al día actual
        selDay.value = String(currentDayId);
        alert("Primero debes cerrar el día actual antes de cambiar a otro.");
        return;
      }

      // Día actual está cerrado → sí permitimos cambiar
      currentDayId = targetDayId;
      renderAll();
    });
  }

  // Botón Cerrar/Reabrir día
  if (btnCloseDay) {
    btnCloseDay.addEventListener("click", onCloseDayClick);
  }
}


// ----------- Tabs inferiores -------------------------------------------

function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const tabs = Array.from(document.querySelectorAll(".tab-content"));

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      buttons.forEach((b) => b.classList.remove("active"));
      tabs.forEach((t) => t.classList.remove("active"));

      btn.classList.add("active");
      const tab = document.getElementById(targetId);
      if (tab) tab.classList.add("active");
    });
  });
}

// ----------- Perfil por defecto ----------------------------------------

function initProfileDefaults() {
  const uConfig = getActiveUserConfig();
  if (!uConfig) return;
  const uState = getUserState(ACTIVE_USER_ID);

  if (!uState.profile || Object.keys(uState.profile).length === 0) {
    uState.profile = {
      name: uConfig.label || "",
      age: uConfig.age || "",
      height: uConfig.heightCm || "",
      startWeight: uConfig.startWeight || "",
      goalCalories: uConfig.calories || "",
      waterTarget: uConfig.waterTargetLiters || 2.0,
      finalWeight: ""
    };
  }
  saveState();
}

// ======================================================================
// RENDER GENERAL
// ======================================================================

function renderAll() {
  const configDay = getConfigDay(currentDayId);
  const userConfig = getActiveUserConfig();
  if (!configDay || !userConfig) return;

  const dayState = getDayState(ACTIVE_USER_ID, currentDayId);
  const dayNutrition = getConfigDayNutrition(configDay);

  renderTopBar(userConfig);
  renderHeader(configDay, dayNutrition, dayState, userConfig);
  renderPortionsCard(dayNutrition, dayState);
  renderMeals(dayNutrition, dayState);
  renderTraining(configDay, userConfig, dayState, dayNutrition);
  renderWaterAndNotes(userConfig, dayState, dayNutrition);
  renderProgressBar(configDay, userConfig, dayNutrition, dayState);
  renderMenusExamples();
  renderProfile();
  renderMonthProgress();

  // 🔹 Actualiza texto/estado del botón Cerrar/Reabrir día
  renderDayStatusSection(dayState);
}

function changeDaySafely(targetDayId) {
  targetDayId = parseInt(targetDayId, 10) || 1;

  // Si es el mismo día, no hacemos nada
  if (targetDayId === currentDayId) return;

  const currentState = getDayState(ACTIVE_USER_ID, currentDayId);

  // Si el día actual NO está cerrado, no permitimos cambiar
  if (!currentState.closed) {
    // Si no quieres alert, luego cambiamos esto por un toast o mensaje discreto
    alert("Primero debes cerrar el día actual antes de cambiar a otro.");
    return;
  }

  // Día actual está cerrado → sí podemos cambiar
  currentDayId = targetDayId;

  // Sincronizar el <select> de días
  const selDay = document.getElementById("daySelect");
  if (selDay) {
    selDay.value = String(targetDayId);
  }

  renderAll();
}

function viewDayFromGrid(targetDayId) {
  targetDayId = parseInt(targetDayId, 10) || 1;

  // Si es el mismo día, nada
  if (targetDayId === currentDayId) return;

  // Aquí NO revisamos si el día actual está cerrado.
  currentDayId = targetDayId;

  // Sincronizar el select, pero sin validación
  const selDay = document.getElementById("daySelect");
  if (selDay) {
    selDay.value = String(targetDayId);
  }

  renderAll();
}




// ----------- Top bar ---------------------------------------------------

function renderTopBar(userConfig) {
  const topName = document.getElementById("topUserName");
  const topAvatar = document.getElementById("topAvatar");
  if (topName) topName.textContent = userConfig.label || "";
  if (topAvatar) {
    const ch =
      (userConfig.label && userConfig.label[0]) ||
      (userConfig.id && userConfig.id[0]) ||
      "?";
    topAvatar.textContent = ch.toUpperCase();
  }
}

// ----------- Header principal ------------------------------------------

function renderHeader(configDay, dayNutrition, dayState, userConfig) {
  const dayNameEl = document.getElementById("dayName");
  const focusEl = document.getElementById("nutritionFocus");
  const kcalSpan = document.getElementById("caloriesHintSpan");
  const statusLabel = document.getElementById("dayStatusLabel");

  if (dayNameEl) {
    // Si el nombre viene como "Día X — Full Body A", reemplazamos solo el número
    const currentNum = currentDayId || configDay.id;
    if (configDay.name) {
      dayNameEl.textContent = configDay.name.replace(/^Día\s+\d+/, `Día ${currentNum}`);
    } else {
      dayNameEl.textContent = `Día ${currentNum}`;
    }
  }

  if (focusEl) focusEl.textContent = dayNutrition?.focus || "";
  if (kcalSpan) {
    kcalSpan.textContent =
      dayNutrition?.calories || userConfig.calories || "";
  }

  if (statusLabel) {
    statusLabel.textContent = dayState.closed
      ? "🟢 Día cerrado"
      : "🟡 Día en curso";
  }
}

function renderDayStatusSection(dayState) {
  const statusLabel = document.getElementById("dayStatusLabel");
  const closeBtn = document.getElementById("btnCloseDay"); // 👈 aquí

  if (!statusLabel || !closeBtn) return;

  if (dayState.closed) {
    statusLabel.innerHTML = `🟢 Día cerrado`;
    closeBtn.innerHTML = `<i class="ph-lock-open"></i> Reabrir día`;
    closeBtn.classList.add("btn-reopen");
    closeBtn.classList.remove("btn-close");
  } else {
    statusLabel.innerHTML = `🟡 Día en curso`;
    closeBtn.innerHTML = `<i class="ph-lock"></i> Cerrar día`;
    closeBtn.classList.add("btn-close");
    closeBtn.classList.remove("btn-reopen");
  }
}


// ----------- Guía de porciones -----------------------------------------

function renderPortionsCard(dayNutrition, dayState) {
  const portionList = document.getElementById("portionTargets");
  if (!portionList) return;

  const portions = dayNutrition?.portions || {
    protein: 0,
    carbs: 0,
    fats: 0,
    veggies: 0,
    fruits: 0,
    dairy: 0
  };

  portionList.innerHTML = `
    <li>Proteína: ${portions.protein || 0} porciones (tu palma, total del día).</li>
    <li>Carbohidratos: ${portions.carbs || 0} porciones (tu puño).</li>
    <li>Grasas saludables: ${portions.fats || 0} porciones.</li>
    <li>Vegetales: ${portions.veggies || 0}+ porciones.</li>
    <li>Frutas: ${portions.fruits || 0} porciones.</li>
    <li>Lácteo opcional: ${portions.dairy || 0} porciones.</li>
  `;

  const p = dayState.portions;
  const mapIds = {
    protein: "chkProtein",
    carbs: "chkCarbs",
    fats: "chkFats",
    veggies: "chkVeggies",
    fruits: "chkFruits",
    dairy: "chkDairy",
    whey: "chkWhey"
  };

  Object.entries(mapIds).forEach(([key, id]) => {
    const chk = document.getElementById(id);
    if (!chk) return;
    chk.checked = !!p[key];
    chk.onchange = () => {
      p[key] = chk.checked;
      saveState();
      updateDayProgressUI();
    };
  });
}

// ----------- Plan alimenticio ------------------------------------------

function renderMeals(dayNutrition, dayState) {
  const container = document.getElementById("mealsContainer");
  const label = document.getElementById("wheyTimingLabel");
  if (!container) return;

  if (!dayNutrition) {
    container.innerHTML = "<p>No hay plan alimenticio para este día.</p>";
    if (label) label.textContent = "";
    return;
  }

  if (label) {
    label.textContent =
      dayNutrition.wheyTiming ||
      "Proteína en polvo según entrenamiento.";
  }

  const meals = Array.isArray(dayNutrition.meals) ? dayNutrition.meals : [];

  // Asegurar array de estado
  if (!Array.isArray(dayState.nutrition.mealsDone)) {
    dayState.nutrition.mealsDone = meals.map(() => false);
  } else if (dayState.nutrition.mealsDone.length < meals.length) {
    const diff = meals.length - dayState.nutrition.mealsDone.length;
    for (let i = 0; i < diff; i++) dayState.nutrition.mealsDone.push(false);
  }

  // UI tipo “pill” para cada comida
  container.innerHTML = meals
    .map(
      (m, idx) => `
      <label class="meal-row" data-meal-row="${idx}">
        <input type="checkbox" class="meal-chk" data-meal="${idx}">
        <span class="meal-bullet"></span>
        <div class="meal-text">
          <strong>${m.name}</strong><br>
          <span>${m.text}</span>
        </div>
      </label>
    `
    )
    .join("");

  const chks = Array.from(container.querySelectorAll(".meal-chk"));
  chks.forEach((chk) => {
    const idx = parseInt(chk.dataset.meal, 10);
    const row = chk.closest(".meal-row");
    const checked = !!dayState.nutrition.mealsDone[idx];

    chk.checked = checked;
    if (row) row.classList.toggle("meal-row-done", checked);

    chk.onchange = () => {
      const isNowChecked = chk.checked;
      dayState.nutrition.mealsDone[idx] = isNowChecked;
      if (row) row.classList.toggle("meal-row-done", isNowChecked);
      saveState();
      updateDayProgressUI();
    };
  });
}

// ----------- Entrenamiento ---------------------------------------------

function getActivityLabels(userConfig) {
  const isGabo = userConfig.id === "gabo";
  if (isGabo) {
    return {
      gym: "Gym",
      walk: "Caminata",
      alt1: "Pádel",
      alt2: "Natación"
    };
  } else {
    return {
      gym: "Gym",
      walk: "Caminata",
      alt1: "Correr",
      alt2: "Baile"
    };
  }
}

function renderTraining(configDay, userConfig, dayState) {
  const labels = getActivityLabels(userConfig);
  const t = dayState.training || (dayState.training = {});

  // ===============================
  //  CHECKBOXES DE MODOS
  // ===============================
  const chkGym = document.getElementById("chkGymMode");
  const chkWalk = document.getElementById("chkWalkDone");
  const chkPadel = document.getElementById("chkPadelDone");
  const chkSwim = document.getElementById("chkSwimDone");
  const chkNoEx = document.getElementById("chkNoExercise");

  if (chkGym)
    chkGym.parentElement.querySelector("span:last-child").textContent =
      labels.gym;
  if (chkWalk)
    chkWalk.parentElement.querySelector("span:last-child").textContent =
      labels.walk;
  if (chkPadel)
    chkPadel.parentElement.querySelector("span:last-child").textContent =
      labels.alt1;
  if (chkSwim)
    chkSwim.parentElement.querySelector("span:last-child").textContent =
      labels.alt2;

  if (chkGym) chkGym.checked = !!t.gym;
  if (chkWalk) chkWalk.checked = !!t.walk;
  if (chkPadel) chkPadel.checked = !!t.alt1;
  if (chkSwim) chkSwim.checked = !!t.alt2;
  if (chkNoEx) chkNoEx.checked = !!t.noExercise;

  // ===============================
  //   ELEMENTOS DE LA INTERFAZ
  // ===============================
  const trainingDetails = document.getElementById("trainingDetails");
  const trainingTitle = document.getElementById("trainingTitle");
  const trainingContent = document.getElementById("trainingContent");

  // ===================================================
  //   SELECCIÓN DE RUTINA A / B / C SEGÚN EL DÍA
  // ===================================================
  const routineOrder = ["A", "B", "C"];
  const routinesByUser = GYM_ROUTINES[userConfig.id] || GYM_ROUTINES["gabo"];
  const routineId = routineOrder[(configDay.id - 1) % routineOrder.length];
  const routine = routinesByUser && routinesByUser[routineId];

  if (!routine) {
    if (trainingTitle) trainingTitle.textContent = "Rutina no definida";
    if (trainingDetails) {
      trainingDetails.innerHTML =
        "<p>No hay rutina configurada para este día.</p>";
    }
    return;
  }

  // Título de la rutina
  if (trainingTitle) {
    trainingTitle.textContent = routine.title || "Rutina del día";
  }

  const gymBlocks = Array.isArray(routine.blocks) ? routine.blocks : [];
  const trainingsDict = (typeof CONFIG === "object" && CONFIG.trainings) || {};

  // ===============================
  //   RENDER DE PASTILLAS (PILLS)
  // ===============================
  if (trainingDetails) {
    trainingDetails.innerHTML = `
      <div class="gym-pill-grid">
        ${gymBlocks
          .map((block, idx) => {
            const key = block.key;
            const label = block.label;
            const lines = Array.isArray(trainingsDict[key])
              ? trainingsDict[key]
              : [];

            return `
              <div class="gym-pill-wrapper" data-pill-index="${idx}">
                <label class="gym-pill">
                  <input type="checkbox" class="gym-exercise" data-gym="${idx}">
                  <span class="gym-pill-circle"></span>
                  <span class="gym-pill-text">${label}</span>
                </label>
                ${
                  lines.length
                    ? `<ul class="exercise-sublist">
                         ${lines.map((txt) => `<li>${txt}</li>`).join("")}
                       </ul>`
                    : ""
                }
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  // ===============================
  //   GUARDADO DE CHECKS POR BLOQUE
  // ===============================
  const gymChecks = Array.from(
    document.querySelectorAll(".gym-exercise")
  );
  const pillWrappers = Array.from(
    document.querySelectorAll(".gym-pill-wrapper")
  );

  if (!Array.isArray(t.gymExercisesDone)) {
    t.gymExercisesDone = gymChecks.map(() => false);
  } else if (t.gymExercisesDone.length !== gymChecks.length) {
    const newArr = gymChecks.map((_, i) => !!t.gymExercisesDone[i]);
    t.gymExercisesDone = newArr;
  }

  function updatePillState(idx, checked) {
    const wrap = pillWrappers[idx];
    if (!wrap) return;
    if (checked) {
      wrap.classList.add("gym-pill-done");
    } else {
      wrap.classList.remove("gym-pill-done");
    }
  }

  gymChecks.forEach((chk) => {
    const idx = parseInt(chk.dataset.gym, 10);
    chk.checked = !!t.gymExercisesDone[idx];
    updatePillState(idx, chk.checked);

    chk.onchange = () => {
      t.gymExercisesDone[idx] = chk.checked;
      updatePillState(idx, chk.checked);
      saveState();
      updateTrainingProgressUI();
      updateDayProgressUI();
    };
  });

  // ===============================
  //  EFECTOS DE "SIN EJERCICIO"
  // ===============================
  function updateNoExerciseUI() {
    const disabled = chkNoEx && chkNoEx.checked;

    [chkGym, chkWalk, chkPadel, chkSwim].forEach((c) => {
      if (c) c.disabled = disabled;
    });

    if (disabled) {
      t.gym = t.walk = t.alt1 = t.alt2 = false;

      if (chkGym) chkGym.checked = false;
      if (chkWalk) chkWalk.checked = false;
      if (chkPadel) chkPadel.checked = false;
      if (chkSwim) chkSwim.checked = false;
    }

    if (trainingContent) {
      trainingContent.style.display =
        !disabled && chkGym && chkGym.checked ? "block" : "none";
    }
  }

  updateNoExerciseUI();
  updateTrainingProgressUI();

  // ===============================
  //   EVENTOS DE LOS CHECKBOXES
  // ===============================
  if (chkGym) {
    chkGym.onchange = () => {
      t.gym = chkGym.checked;
      saveState();
      updateNoExerciseUI();
      updateDayProgressUI();
    };
  }

  if (chkWalk) {
    chkWalk.onchange = () => {
      t.walk = chkWalk.checked;
      saveState();
      updateDayProgressUI();
    };
  }

  if (chkPadel) {
    chkPadel.onchange = () => {
      t.alt1 = chkPadel.checked;
      saveState();
      updateDayProgressUI();
    };
  }

  if (chkSwim) {
    chkSwim.onchange = () => {
      t.alt2 = chkSwim.checked;
      saveState();
      updateDayProgressUI();
    };
  }

  if (chkNoEx) {
    chkNoEx.onchange = () => {
      t.noExercise = chkNoEx.checked;
      saveState();
      updateNoExerciseUI();
      updateDayProgressUI();
    };
  }
}




function updateTrainingProgressUI() {
  const dayState = getDayState(ACTIVE_USER_ID, currentDayId);
  const t = dayState.training;
  const fill = document.getElementById("trainingProgressFill");
  const label = document.getElementById("trainingProgressPercent");

  const list = Array.isArray(t.gymExercisesDone) ? t.gymExercisesDone : [];
  const total = list.length || 1;
  const done = list.filter(Boolean).length;
  const pct = Math.round((done / total) * 100);

  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}

// ----------- Agua y notas ----------------------------------------------

function renderWaterAndNotes(userConfig, dayState, dayNutrition) {
  const waterInput = document.getElementById("waterInput");
  const waterInfo = document.getElementById("waterInfo");
  const notesInput = document.getElementById("notesInput");

  const uState = getUserState(ACTIVE_USER_ID);
  const target =
    (uState.profile && uState.profile.waterTarget) ||
    userConfig.waterTargetLiters ||
    2.0;

  if (waterInput) {
    waterInput.value =
      typeof dayState.waterLiters === "number"
        ? dayState.waterLiters
        : 0;
    waterInput.oninput = () => {
      const val = parseFloat(waterInput.value.replace(",", ".")) || 0;
      dayState.waterLiters = val;
      saveState();
      updateWaterInfo(target);
      updateDayProgressUI();
    };
  }

  if (waterInfo) {
    updateWaterInfo(target);
  }

  if (notesInput) {
    notesInput.value = dayState.notes || "";
    notesInput.oninput = () => {
      dayState.notes = notesInput.value;
      saveState();
    };
  }
}

function updateWaterInfo(target) {
  const waterInfo = document.getElementById("waterInfo");
  const dayState = getDayState(ACTIVE_USER_ID, currentDayId);
  if (!waterInfo) return;

  const val =
    typeof dayState.waterLiters === "number" ? dayState.waterLiters : 0;

  const diff = target - val;
  if (diff <= 0) {
    waterInfo.textContent = `${val.toFixed(1)} L de ${target.toFixed(
      1
    )} L ✅ Meta alcanzada`;
  } else {
    waterInfo.textContent = `${val.toFixed(1)} L de ${target.toFixed(
      1
    )} L · Faltan ${diff.toFixed(1)} L`;
  }
}

// ----------- Progreso total día (barra superior) -----------------------

function computeDayCompletion(configDay, userConfig, dayNutrition, dayState) {
  const scores = [];

  // Entrenamiento
  const t = dayState.training;
  if (!t.noExercise) {
    let totalActs = 0;
    let doneActs = 0;

    if (t.gym) {
      totalActs += 1;
      const list = Array.isArray(t.gymExercisesDone)
        ? t.gymExercisesDone
        : [];
      if (list.length > 0) {
        const doneGym = list.filter(Boolean).length;
        doneActs += doneGym / list.length;
      }
    }

    ["walk", "alt1", "alt2"].forEach((k) => {
      if (t[k]) {
        totalActs += 1;
        doneActs += 1;
      }
    });

    if (totalActs > 0) {
      scores.push(doneActs / totalActs);
    }
  }

  // Nutrición (comidas + porciones)
  if (dayNutrition) {
    const meals = Array.isArray(dayNutrition.meals)
      ? dayNutrition.meals
      : [];
    let nutScore = 0;
    const totalMeals = meals.length;

    if (totalMeals > 0) {
      const doneMeals = Array.isArray(dayState.nutrition.mealsDone)
        ? dayState.nutrition.mealsDone.filter(Boolean).length
        : 0;
      nutScore = doneMeals / totalMeals;
    }

    const p = dayState.portions;
    const portionList = [
      p.protein,
      p.carbs,
      p.fats,
      p.veggies,
      p.fruits,
      p.dairy,
      p.whey
    ];
    const doneP = portionList.filter(Boolean).length;
    const portionScore = portionList.length ? doneP / portionList.length : 0;

    const both = [];
    if (totalMeals > 0) both.push(nutScore);
    if (portionList.length > 0) both.push(portionScore);

    if (both.length > 0) {
      scores.push(both.reduce((a, b) => a + b, 0) / both.length);
    }
  }

  // Agua
  const uState = getUserState(ACTIVE_USER_ID);
  const target =
    (uState.profile && uState.profile.waterTarget) ||
    userConfig.waterTargetLiters ||
    2.0;
  if (target > 0) {
    const actual =
      typeof dayState.waterLiters === "number" ? dayState.waterLiters : 0;
    scores.push(Math.min(actual / target, 1));
  }

  if (!scores.length) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 100);
}

function renderProgressBar(configDay, userConfig, dayNutrition, dayState) {
  const pct = computeDayCompletion(configDay, userConfig, dayNutrition, dayState);
  const fill = document.getElementById("dayTotalFill");
  const label = document.getElementById("dayTotalPercent");

  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}

function updateDayProgressUI() {
  const configDay = getConfigDay(currentDayId);
  const userConfig = getActiveUserConfig();
  const dayState = getDayState(ACTIVE_USER_ID, currentDayId);
  const nutrition = getConfigDayNutrition(configDay);

  // Barra de progreso del día y barra de gym
  renderProgressBar(configDay, userConfig, nutrition, dayState);
  updateTrainingProgressUI();

  // 🔄 Actualizar también el resumen de "Progreso del mes"
  const summary = document.getElementById("monthDaySummary");
  if (summary && summary.dataset.dayId) {
    const summaryDayId = parseInt(summary.dataset.dayId, 10);
    if (!Number.isNaN(summaryDayId)) {
      renderMonthDaySummary(summaryDayId);
    }
  }
}


// ----------- Cerrar / reabrir día --------------------------------------

function onCloseDayClick() {
  const configDay = getConfigDay(currentDayId);
  const userConfig = getActiveUserConfig();
  const dayState = getDayState(ACTIVE_USER_ID, currentDayId);
  if (!configDay || !userConfig) return;

  if (!dayState.closed) {
    const t = dayState.training;
    const anyActivity =
      t.noExercise || t.gym || t.walk || t.alt1 || t.alt2;

    if (!anyActivity) {
      alert(
        "Antes de cerrar el día, marca al menos una opción de ejercicio o 'No hice ejercicio'."
      );
      return;
    }

    if (!confirm("¿Seguro que quieres cerrar este día?")) return;
    dayState.closed = true;
  } else {
    if (!confirm("El día está cerrado. ¿Quieres reabrirlo?")) return;
    dayState.closed = false;
  }

  saveState();
  renderAll();
}

// ----------- Menús tab --------------------------------------------------

function renderMenusExamples() {
  const cont = document.getElementById("menusExamples");
  if (!cont || !CONFIG || !Array.isArray(CONFIG.menuExamples)) return;

  cont.innerHTML = CONFIG.menuExamples
    .map((m) => {
      const title = m.name || m.title || "Ejemplo";

      // Si viene como lista de items → lista
      if (Array.isArray(m.items)) {
        return `
          <div class="menu-group">
            <h3>${title}</h3>
            <ul>
              ${m.items.map((it) => `<li>${it}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      // Si viene como "title" + "text" → texto
      const text = m.text || "";
      return `
        <div class="menu-group">
          <h3>${title}</h3>
          <p>${text}</p>
        </div>
      `;
    })
    .join("");
}


// ----------- Perfil tab -------------------------------------------------

function renderProfile() {
  const uConfig = getActiveUserConfig();
  const uState = getUserState(ACTIVE_USER_ID);
  const p = uState.profile || {};

  const fields = {
    profileName: "name",
    profileAge: "age",
    profileHeight: "height",
    profileStartWeight: "startWeight",
    profileGoalCalories: "goalCalories",
    profileWaterTarget: "waterTarget",
    profileFinalWeight: "finalWeight"
  };

  Object.entries(fields).forEach(([id, key]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = p[key] != null ? p[key] : "";
    input.oninput = () => {
      p[key] =
        key === "name" ? input.value : parseFloat(input.value) || input.value;
      uState.profile = p;
      saveState();
      renderMonthProgress();
    };
  });

  const monthStatus = document.getElementById("monthStatusText");
  const weightDiff = document.getElementById("weightDiffText");

  const startW = parseFloat(p.startWeight);
  const finalW = parseFloat(p.finalWeight);
  if (monthStatus) {
    monthStatus.textContent = "Resumen de progreso del mes.";
  }
  if (weightDiff) {
    if (!isNaN(startW) && !isNaN(finalW)) {
      const diff = finalW - startW;
      const sign = diff > 0 ? "+" : "";
      weightDiff.textContent = `Cambio de peso: ${sign}${diff.toFixed(1)} kg`;
    } else {
      weightDiff.textContent =
        "Registra tu peso inicial y el peso final del mes para ver el cambio.";
    }
  }
}

// ----------- Progreso tab ----------------------------------------------

// ----------- Progreso tab ----------------------------------------------
function renderMonthProgress() {
  const cont = document.getElementById("monthGrid");
  if (!cont) return;

  cont.innerHTML = "";

  const userConfig = getActiveUserConfig();
  const TOTAL_DAYS = 30;

  for (let dayId = 1; dayId <= TOTAL_DAYS; dayId++) {
    const configDay = getConfigDay(dayId);
    if (!configDay) continue;

    const dayState = getDayState(ACTIVE_USER_ID, dayId);
    const dayNutrition = getConfigDayNutrition(configDay);
    const pct = computeDayCompletion(
      configDay,
      userConfig,
      dayNutrition,
      dayState
    );

    let cls = "zero";
    if (pct >= 100) cls = "done";
    else if (pct > 0) cls = "partial";

    const div = document.createElement("div");
    div.className = `month-day-box ${cls}${
      dayId === currentDayId ? " current-day" : ""
    }`;
    div.textContent = String(dayId);
    div.title = `Día ${dayId} - ${pct}%`;

    // 👇 IMPORTANTE: solo muestra el resumen, NO cambia el día de la app
    div.addEventListener("click", () => {
      // resaltar en la grilla
      const allBoxes = cont.querySelectorAll(".month-day-box.current-day");
      allBoxes.forEach((b) => b.classList.remove("current-day"));
      div.classList.add("current-day");

      // actualizar el resumen debajo
      renderMonthDaySummary(dayId);
    });

    cont.appendChild(div);
  }

  // Resumen inicial: el día actual
  renderMonthDaySummary(currentDayId);
}

function renderMonthDaySummary(dayId) {
  const summary = document.getElementById("monthDaySummary");
  if (!summary) return;

  summary.dataset.dayId = String(dayId);

  const userConfig = getActiveUserConfig();
  const configDay = getConfigDay(dayId);

  if (!configDay || !userConfig) {
    summary.innerHTML = `
      <p class="month-day-summary-placeholder">
        No hay información para el día ${dayId}.
      </p>
    `;
    return;
  }

  const dayState = getDayState(ACTIVE_USER_ID, dayId);
  const dayNutrition = getConfigDayNutrition(configDay);

  const pctRaw = computeDayCompletion(
    configDay,
    userConfig,
    dayNutrition,
    dayState
  );
  const pct = Math.round(Math.max(0, Math.min(100, pctRaw)));

  // --- comidas ---
  let mealsDone = 0;
  let mealsTotal = 0;
  if (dayNutrition && Array.isArray(dayNutrition.meals)) {
    mealsTotal = dayNutrition.meals.length;
    const mealsState =
      (dayState.nutrition && dayState.nutrition.mealsDone) || [];
    mealsDone = mealsState.filter(Boolean).length;
  }
  const mealsPct = mealsTotal ? Math.round((mealsDone / mealsTotal) * 100) : 0;

  // --- gym ---
  let gymBlocksDone = 0;
  let gymBlocksTotal = 0;
  if (dayState.training && Array.isArray(dayState.training.gymExercisesDone)) {
    gymBlocksTotal = dayState.training.gymExercisesDone.length;
    gymBlocksDone = dayState.training.gymExercisesDone.filter(Boolean).length;
  }
  const gymPct = gymBlocksTotal
    ? Math.round((gymBlocksDone / gymBlocksTotal) * 100)
    : 0;

  // --- estado y si hay datos ---
  const hasAnyData = pct > 0 || mealsDone > 0 || gymBlocksDone > 0;

  // Caso especial: día no iniciado y sin datos → solo pill + mensaje
  if (!hasAnyData && !dayState.closed) {
    summary.innerHTML = `
      <div class="month-day-summary-layout month-day-summary-empty">
        <div class="month-day-summary-header-block month-day-summary-header-center">
          <span class="month-day-summary-status not-started">
            Día no iniciado
          </span>
        </div>
        <p class="month-day-summary-placeholder">
          Aún no hay datos de progreso para este día.
        </p>
      </div>
    `;
    return;
  }

  // Resto de estados: en curso / cerrado con layout completo
  let statusText = "";
  let statusClass = "";

  if (dayState.closed) {
    statusText = "Día cerrado";
    statusClass = "closed";
  } else {
    statusText = "Día en curso";
    statusClass = "open";
  }

  summary.innerHTML = `
    <div class="month-day-summary-layout">

      <!-- Estado + título arriba -->
      <div class="month-day-summary-header-block">
        <span class="month-day-summary-status ${statusClass}">
          ${statusText}
        </span>
        <span class="month-day-summary-title">
          Día ${dayId} — detalle del día
        </span>
      </div>

      <!-- Fila de círculos centrados -->
      <div class="month-day-circles-row">

        <div class="month-day-circle-wrapper">
          <div class="summary-circle" style="--pct:${pct}">
            <div class="summary-circle-inner">
              <span class="summary-circle-percent">${pct}%</span>
            </div>
          </div>
          <p class="circle-label">Progreso total</p>
        </div>

        <div class="month-day-circle-wrapper">
          <div class="summary-circle" style="--pct:${mealsPct}">
            <div class="summary-circle-inner">
              <span class="summary-circle-percent">${mealsDone}/${mealsTotal}</span>
            </div>
          </div>
          <p class="circle-label">Comidas</p>
          <p class="circle-sub">
            ${mealsTotal ? `${mealsDone}/${mealsTotal} comidas marcadas` : "Sin plan de comidas"}
          </p>
        </div>

        <div class="month-day-circle-wrapper">
          <div class="summary-circle" style="--pct:${gymPct}">
            <div class="summary-circle-inner">
              <span class="summary-circle-percent">${gymBlocksDone}/${gymBlocksTotal}</span>
            </div>
          </div>
          <p class="circle-label">Gym</p>
          <p class="circle-sub">
            ${gymBlocksTotal ? `${gymBlocksDone}/${gymBlocksTotal} bloques de gym completados` : "Sin bloques de gym"}
          </p>
        </div>

      </div>

    </div>
  `;
}






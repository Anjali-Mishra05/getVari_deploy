# The GetVari Recovery Engine: Simplified Physiology Guide

Welcome to the **GetVari Recovery Engine**. This guide explains in simple, non-technical terms how our software simulates your body's hydration, absorption, and sweat rates in real time.

---

## 1. The "Two Buckets" Metaphor
To understand how hydration works, think of your body as having **two connected water buckets**:

```
 [ Your Drink ] ──>  [ Bucket 1: The Stomach ]
                           │
                           │  (Absorption Speed)
                           ▼
                     [ Bucket 2: Blood & Cells ]  ──> [ Sweat Loss ]
```

*   **Bucket 1 (Stomach):** Water you have swallowed but hasn't entered your bloodstream yet. 
*   **Bucket 2 (Blood & Cells):** Active water circulating in your system keeping you hydrated. **This bucket determines your Hydration Risk Score.**

---

## 2. The Simple Formulas

### A. Stomach Volume (Water Awaiting Absorption)
When you drink water, it enters your stomach bucket. Over time, your stomach empties as the water is absorbed into your body.

$$\text{New Stomach Water} = \text{Current Stomach Water} - \text{Water Absorbed}$$

> [!NOTE]
> **Stomach Limit:** Capped at `1,200ml` (1.2 Liters) max capacity to represent a safe physical limit of the human stomach before feeling bloated.

### B. Absorbed Hydration (Your Circulating Fluid Pool)
Your active body fluid pool gains water from the stomach, and loses water continuously through sweat evaporation.

$$\text{New Body Water} = \text{Current Body Water} + \text{Water Absorbed} - \text{Sweat Loss}$$

> [!IMPORTANT]
> **Body Saturation Limit:** Bounded between `0ml` and `1,000ml` (1 Liter). Once you reach 1 Liter of absorbed active hydration, your body is fully saturated. Any excess fluid is safely excreted as waste.

---

## 3. How the Speeds are Calculated

### Absorption Speed
Your stomach absorbs water at a baseline rate of **12 ml per minute** under resting/cool conditions. However, when you work out or get hot, your body shunts blood flow away from the stomach to cool your muscles and skin, slowing absorption down:

$$\text{Absorption Speed} = \text{Resting Rate (12ml/min)} \times \text{Stomach blood flow %}$$

*   **At Rest (Office Worker):** Stomach blood flow is at **100%** $\rightarrow$ Water absorbs at maximum speed.
*   **Heavy Strain (Gym Workout):** Stomach blood flow is choked down to **30%** $\rightarrow$ Water absorbs at a crawl.

### Sweat Loss Rate
Your body continuously evaporates water. The baseline is **1.4 ml per minute**, but it accelerates rapidly as you move (Exertion Load) or get hot (Ambient Temperature):

$$\text{Sweat Loss} = \text{Baseline (1.4ml/min)} + \text{Activity Heat Addition}$$

---

## 4. Practical Real-World Examples

### Scenario A: Working Out in Hot Weather (Dehydration Deficit)
*   **Your Sweat Loss:** High (`-15.0 ml/min`)
*   **Your Absorption Speed:** Throttled (`+4.0 ml/min`)
*   **The Result:** Even if your stomach is full of water, **you are sweating out fluid nearly 4 times faster than your gut can absorb it**. Your bloodstream fluid pool stays at `0` until you rest and cool down.

### Scenario B: Cooling Down & Recovering (Rehydration)
*   **Your Sweat Loss:** Low (`-3.0 ml/min`)
*   **Your Absorption Speed:** High (`+12.0 ml/min`)
*   **The Result:** Absorption easily outpaces sweat. Your bloodstream fluid pool quickly builds back up to optimal levels, reducing your Hydration Risk Score!

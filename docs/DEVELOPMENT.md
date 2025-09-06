# 🛡️ DEVELOPMENT GUIDELINES & PROJECT RULES

**⚠️ CRITICAL: This file contains the 12 immutable project rules that MUST be followed by ALL AI agents and developers working on this codebase. These rules supersede any other documentation or preferences. Commit to long-term memory!**

---

## 📋 THE 12 IMMUTABLE PROJECT RULES

### 🔴 RULE 1: FOUNDATION FEATURES
**NEVER change any foundational features or functions without explicit user acknowledgement. This includes core chat functionality, file processing, plugin systems, or any existing user workflows.**

### 🔴 RULE 2: PRODUCTION QUALITY
**Remember, there can ALWAYS be a better way to do something. NEVER skip, shortcut, or "dumb down" tasks for ease. No exceptions for complexity or difficulty.Always use the most current/latest libraries/components whenever possible, unless it sacrifies stability or security**

### 🔴 RULE 3: COMPLETE REFACTORING
**Identify and refactor ALL incomplete code/modules/mocks for production readiness. This includes removing ALL simulated logic, mock data, and placeholder implementations.**

### 🔴 RULE 4: CODEBASE STREAMLINING
**Minimize codebase sprawl by continuously removing unnecessary files, duplicates, and backups as you work. Maintain a lean, efficient codebase. Keep organized such as using /docs, /backups, /images, etc. in the root. Already existing, make sure ALL links to the organization changes is changed anywhere/everywhere they exist**

### 🔴 RULE 5: TOKEN LIMIT STRATEGY
**Use efficient strategies to overcome token/context limits (chunking/merging files), but ensure a streamlined final codebase. Never leave fragmented code.**

### 🔴 RULE 6: CLARIFICATION OVER ASSUMPTION
**Always clarify uncertainties with the user rather than making assumptions. When in doubt, ask for explicit confirmation.**

### 🔴 RULE 7: EFFICIENT WORKFLOW
**Work tasks in the most efficient order for project and workflow efficiency. Do not ask what to work on next - prioritize based on project needs and the most efficient order for your agentic workflow processes. Be smart/innovative and always use every tool/option at your disposal to be as efficient as possible - parallelism, spinning up your own temporary AI Agents (or permanent!), etc. are examples of efficiency and innovation expected**

### 🔴 RULE 8: VISUAL TASK TRACKING
**Maintain a visually stunning, graphical task list file for live IDE updates. This dashboard must remain current and visually appealing and updated as progress is made within a CURRENT_TASKS.md file in the root.**

### 🔴 RULE 9: DOCUMENTATION CONSISTENCY
**Consistently update documentation for seamless agent transitions. Every change must be documented for the next developer.**

### 🔴 RULE 10: RULE EVOLUTION
**Add any new rules/requirements to this list as they arise. This document must evolve with the project.**

### 🔴 RULE 11: 100% GOAL COMPLETION
**Ensure 100% goal completion. No returning to address troublesome tasks/issues/fixes unless explicitly advised. Complete everything the first time and always be in the mindset to develop for production (no mock, unfinished components, etc. unless explicitly tasked to do so. Full production-ready code is required at all times. Do NOT state the project is 100%, production ready, etc. unless you are told it is. There should be NO false claims of completion, 100%, or otherwise unless it absolutely 100% is - which you will be told when this is. No "blowing smoke", keep 100% honest at all times.**

### 🔴 RULE 12: NEXT-GEN INNOVATION
**Target next-gen/futuristic GUI with bleeding-edge components and innovative workflow design, while maintaining production stability.**

---

## 📊 Current Development Focus:

### Backend API (Config-Service)
- Go microservice on port 5004 handling GET/POST /api/config and POST /api/services/*/restart
- Atomic config writes with backups; restarts impacted services (fluent-bit, goflow2, telegraf)

### Dynamic Ports
- GoFlow2 reads NetFlow/IPFIX/sFlow ports from JSON via start-goflow2-production.sh
- Fluent Bit syslog input generated via start-fluent-bit-dynamic.sh (protocol/port/bind address)
- Telegraf snmp_trap input generated via start-telegraf-dynamic.sh (trap port)

### Frontend
- Navigation label changed to Flow
- Flow page includes toggle to view Both / NetFlow-IPFIX / sFlow

### ✅ ACTIVE PRIORITIES HERE:
- Finalize dynamic restart verification for fluent-bit and telegraf
- Fix vector-minimal.toml unknown field (max_files) and validate vector starts
- Write E2E tests for config persistence and listener checks
- Update documentation (SYSTEM_AUDIT.md) for new runtime behavior

### ✅ OPTIONAL FEATURES IMPLEMENTED
- Auth for config-service via static API key (env NOC_RAVEN_API_KEY). Clients send X-API-Key or Authorization: Bearer <key>. CORS preflight allowed. Nginx passes Authorization header through.

### ❌ DEFERRED FEATURES (Back-Burner)
- Rate limiting at app-level (Nginx rate limiting already applied at proxy)
- HTTPS enablement for nginx in container with self-signed certs


---

## 🚀 Development Commands

```bash
# Core Development
npm run dev                    # Standard development
npm run build:production       # Production build
npm run test:comprehensive     # Full test suite
npm run lint:strict           # Strict linting

# Feature Development
npm run dev:next-gen          # Next-gen features
npm run build:optimized       # Optimized production build
npm run test:performance      # Performance testing

# Documentation
npm run docs:update           # Auto-update documentation
npm run docs:validate         # Validate documentation
```

---

## 📋 Agent Transition Checklist

When transitioning between AI agents, ensure:

- [ ] All 12 rules have been reviewed and understood
- [ ] Current task progress is documented in ROADMAP.md
- [ ] CURRENT_TASKS.md is updated with latest progress close to realtime
- [ ] Any new rules/requirements are added to this file
- [ ] Back-burner features remain deferred
- [ ] Production readiness is maintained

---

## 🔗 Quick Reference Links

- **ROADMAP.md**: Complete development plan
- **CURRENT_TASKS.md**: Live progress visualization
- **DEVELOPMENT.md**: This rule document (current file)
- **CHANGELOG.md**: Detailed change history

---

**⚠️ WARNING**: Any deviation from these 12 rules requires explicit user approval and documentation in this file.

**📅 Last Updated**: July 27, 2025 at 11:39 AM CST
**📞 Questions**: Always clarify before proceeding with any uncertain implementation

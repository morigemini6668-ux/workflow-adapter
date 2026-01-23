# Triage Report: {fix_name}

## Overview
- **Fix Name**: {name}
- **Reported Issue**: {initial description}
- **Issue Type**: Bug | Performance | Tech Debt | Security
- **Severity**: Critical | High | Medium | Low
- **Triage Date**: {timestamp}

## Problem Description

### Symptoms
{User-reported symptoms and observations}

### Reproduction Steps
1. {step 1}
2. {step 2}
3. Expected: {expected behavior}
4. Actual: {actual behavior}

### Error Information
```
{Error messages, stack traces if available}
```

## Root Cause Analysis

### Investigation Summary
{Summary of code analysis performed}
- Tools used: {Grep, Explore agent, Serena, etc.}
- Files examined: {list}

### Identified Root Cause
{Detailed explanation of why the problem occurs}

### Evidence
| Location | Code | Reason |
|----------|------|--------|
| `{path}:{line}` | `{snippet}` | {why this is the cause} |

### Contributing Factors
- {factor 1}
- {factor 2}

## Impact Scope

### Affected Components
| Component | File(s) | Impact Level |
|-----------|---------|--------------|
| {component} | `{path}` | High/Medium/Low |

### Affected Functionality
- {functionality 1}
- {functionality 2}

### Dependencies
{External/internal dependencies that might be affected}

## Proposed Solutions

### Solution 1: {name} (Recommended)
**Description**: {detailed description}

**Changes Required**:
| File | Change |
|------|--------|
| `{file1}` | {what to change} |
| `{file2}` | {what to change} |

**Pros**:
- {advantage 1}
- {advantage 2}

**Cons**:
- {disadvantage 1}

**Estimated Effort**: Small | Medium | Large

---

### Solution 2: {name} (Alternative)
**Description**: {detailed description}

**Changes Required**:
| File | Change |
|------|--------|
| `{file}` | {what to change} |

**Pros**:
- {advantage}

**Cons**:
- {disadvantage}

**Estimated Effort**: Small | Medium | Large

---

### Chosen Approach
**Selected**: Solution {n}

**Reasoning**: {why this solution was selected}

## Risk Assessment

### Potential Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| {risk 1} | High/Medium/Low | High/Medium/Low | {mitigation strategy} |
| {risk 2} | High/Medium/Low | High/Medium/Low | {mitigation strategy} |

### Testing Requirements
- [ ] Unit tests for {component}
- [ ] Integration tests for {flow}
- [ ] Regression tests for {previous functionality}
- [ ] Manual testing for {scenario}

### Rollback Plan
{How to revert if something goes wrong}
1. {rollback step 1}
2. {rollback step 2}

## Recommendations

### Immediate Actions
1. {action 1}
2. {action 2}

### Follow-up Tasks
- {task that should be done later}
- {technical debt to address}

## Related Information

### Related Issues
| Issue | Relation |
|-------|----------|
| fix_{name} | {how it's related} |
| feature_{name} | {how it's related} |

### References
- {Documentation link}
- {Ticket/Issue link}
- {Similar fix reference}

---
_Triage completed: {timestamp}_
_Analyst: Claude_

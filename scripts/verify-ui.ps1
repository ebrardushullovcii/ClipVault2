#!/usr/bin/env pwsh
# ClipVault UI Verification Script
# Quick lint and typecheck for UI project from root

$ErrorActionPreference = "Continue"

Write-Host "=== ClipVault UI Verification ===" -ForegroundColor Cyan
Write-Host ""

# Change to UI directory
Push-Location -Path (Join-Path $PSScriptRoot "..\ui")

try {
    Write-Host "Running TypeScript typecheck..." -ForegroundColor Yellow
    $typecheck = npm run typecheck 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] TypeScript typecheck passed" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] TypeScript typecheck failed" -ForegroundColor Red
        Write-Host $typecheck
    }

    Write-Host ""
    Write-Host "Running ESLint..." -ForegroundColor Yellow
    $lint = npm run lint 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] ESLint passed" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] ESLint found issues" -ForegroundColor Red
        Write-Host $lint
    }

    Write-Host ""
    Write-Host "Checking Prettier format..." -ForegroundColor Yellow
    $format = npm run format:check 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Prettier format check passed" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Prettier formatting issues" -ForegroundColor Yellow
        Write-Host $format
        Write-Host ""
        Write-Host "To fix formatting, run: npm run format" -ForegroundColor Cyan
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Cyan
import React from "react";

/**
 * 1. DASHBOARD SKELETON (Mirrors ProjectDashboard.jsx layout)
 */
export function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-pulse select-none py-6">
      {/* Header bar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-[var(--bg-panel)] rounded-xl skeleton-shimmer" />
          <div className="h-3 w-80 bg-[var(--bg-panel)] rounded-md skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 bg-[var(--bg-panel)] rounded-xl skeleton-shimmer" />
          <div className="h-9 w-36 bg-[var(--bg-panel)] rounded-xl skeleton-shimmer" />
        </div>
      </div>

      {/* 4 Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
              <div className="h-8 w-8 rounded-2xl bg-[var(--bg-surface)] skeleton-shimmer" />
            </div>
            <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            <div className="h-3 w-36 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="h-9 w-64 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
          <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
          <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
        </div>
      </div>

      {/* 6 Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-4 w-44 bg-[var(--bg-surface)] rounded-lg skeleton-shimmer" />
                <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
              </div>
              <div className="h-6 w-16 bg-[var(--bg-surface)] rounded-full skeleton-shimmer" />
            </div>

            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
                <div className="h-3 w-10 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
              </div>
              <div className="h-2 w-full bg-[var(--bg-surface)] rounded-full skeleton-shimmer" />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
              <div className="h-4 w-20 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
              <div className="h-8 w-28 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 2. PROJECT DETAILS - OVERVIEW SKELETON
 */
export function ProjectDetailsOverviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse select-none">
      {/* 4 Executive Metric Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
              <div className="h-9 w-9 rounded-2xl bg-[var(--bg-surface)] skeleton-shimmer" />
            </div>
            <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            <div className="h-3 w-32 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      {/* Health Score & Velocity Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 flex items-center gap-6">
          <div className="h-24 w-24 rounded-full bg-[var(--bg-surface)] shrink-0 skeleton-shimmer" />
          <div className="space-y-2 flex-1">
            <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
            <div className="h-5 w-44 bg-[var(--bg-surface)] rounded-lg skeleton-shimmer" />
            <div className="h-3 w-full bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 flex items-center justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="h-3 w-32 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
            <div className="h-8 w-28 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            <div className="h-3 w-48 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
          <div className="h-12 w-12 rounded-2xl bg-[var(--bg-surface)] shrink-0 skeleton-shimmer" />
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-3">
          <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-9 bg-[var(--bg-surface)] rounded-2xl skeleton-shimmer" />
            <div className="h-9 bg-[var(--bg-surface)] rounded-2xl skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Target Language Matrix Skeleton */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="h-4 w-48 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
            <div className="h-3 w-80 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
          <div className="h-8 w-36 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4.5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-4 w-32 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
                <div className="h-4 w-10 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
              </div>
              <div className="h-2 w-full bg-[var(--bg-panel)] rounded-full skeleton-shimmer" />
              <div className="h-3 w-40 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 3. PROJECT DETAILS - FILES TAB SKELETON
 */
export function ProjectDetailsFilesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse select-none">
      {/* Upload Dropzone Card Skeleton */}
      <div className="border-2 border-dashed border-[var(--border-medium)] bg-[var(--bg-panel)] rounded-3xl p-6 text-center space-y-3">
        <div className="h-10 w-10 rounded-2xl bg-[var(--bg-surface)] mx-auto skeleton-shimmer" />
        <div className="h-4 w-64 bg-[var(--bg-surface)] mx-auto rounded-lg skeleton-shimmer" />
        <div className="h-3 w-96 bg-[var(--bg-surface)] mx-auto rounded skeleton-shimmer" />
      </div>

      {/* Control Toolbar Skeleton */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="h-9 w-72 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-28 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            <div className="h-8 w-32 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
          </div>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-7 w-16 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-6 w-12 bg-[var(--bg-surface)] rounded-lg skeleton-shimmer" />
            ))}
          </div>
        </div>
      </div>

      {/* Document Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-12 bg-[var(--bg-surface)] rounded-md skeleton-shimmer" />
              <div className="h-6 w-6 rounded-lg bg-[var(--bg-surface)] skeleton-shimmer" />
            </div>
            <div className="h-4 w-44 bg-[var(--bg-surface)] rounded-lg skeleton-shimmer" />
            <div className="h-3 w-32 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="h-2 w-full bg-[var(--bg-surface)] rounded-full skeleton-shimmer" />
              <div className="h-2 w-full bg-[var(--bg-surface)] rounded-full skeleton-shimmer" />
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="h-9 w-full bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 4. PROJECT DETAILS - LANGUAGES TAB SKELETON
 */
export function ProjectDetailsLanguagesSkeleton() {
  return (
    <div className="space-y-8 animate-pulse select-none">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-4 w-56 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          <div className="h-3 w-96 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-40 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-[var(--bg-surface)] skeleton-shimmer" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
                <div className="h-3 w-12 bg-[var(--bg-surface)] rounded-md skeleton-shimmer" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-[var(--bg-surface)] p-3 rounded-2xl">
              <div className="h-6 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
              <div className="h-6 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
              <div className="h-6 bg-[var(--bg-panel)] rounded skeleton-shimmer" />
            </div>

            <div className="h-2 w-full bg-[var(--bg-surface)] rounded-full skeleton-shimmer" />
            <div className="h-9 w-full bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 5. PROJECT DETAILS - ANALYTICS TAB SKELETON
 */
export function ProjectDetailsAnalyticsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse select-none">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-4 w-64 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          <div className="h-3 w-96 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-36 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-2 text-center">
            <div className="h-4 w-20 bg-[var(--bg-surface)] mx-auto rounded-md skeleton-shimmer" />
            <div className="h-7 w-16 bg-[var(--bg-surface)] mx-auto rounded-lg skeleton-shimmer" />
            <div className="h-3 w-24 bg-[var(--bg-surface)] mx-auto rounded skeleton-shimmer" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-3xl p-6 space-y-3">
            <div className="h-3 w-28 bg-[var(--bg-surface)] rounded skeleton-shimmer" />
            <div className="h-8 w-24 bg-[var(--bg-surface)] rounded-xl skeleton-shimmer" />
            <div className="h-3 w-full bg-[var(--bg-surface)] rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * PageSkeleton fallback alias
 */
export const PageSkeleton = ProjectDetailsOverviewSkeleton;
export const CardGridSkeleton = DashboardSkeleton;

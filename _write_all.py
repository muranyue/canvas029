#!/usr/bin/env python3
"""Writes the refactored App.tsx and ContextMenu.tsx"""

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    print(f"Written: {path} ({len(content)} chars)")

# Part 1 of App.tsx - will be assembled from parts
parts = []

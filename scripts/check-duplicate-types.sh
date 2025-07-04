#!/bin/bash

# Script to check for duplicate type/interface declarations across packages
# Exit with error if duplicates are found that should be in shared-types

set -e

echo "Checking for duplicate type/interface declarations..."

# Find all TypeScript files excluding node_modules
mapfile -t files < <(find apps packages -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v dist | grep -v build)

# Track declarations
declare -A declarations
declare -A locations

# Parse each file for interface/type declarations
for file in "${files[@]}"; do
    # Extract interface and type declarations
    while IFS= read -r line; do
        if [[ $line =~ ^[[:space:]]*export[[:space:]]+(interface|type)[[:space:]]+([A-Za-z][A-Za-z0-9]*) ]]; then
            decl_type="${BASH_REMATCH[1]}"
            decl_name="${BASH_REMATCH[2]}"
            
            # Track the declaration
            if [[ -z "${declarations[$decl_name]}" ]]; then
                declarations[$decl_name]=1
                locations[$decl_name]="$file"
            else
                # Found duplicate
                declarations[$decl_name]=$((declarations[$decl_name] + 1))
                locations[$decl_name]="${locations[$decl_name]},$file"
            fi
        fi
    done < "$file"
done

# Check for duplicates
found_duplicates=false
for name in "${!declarations[@]}"; do
    count="${declarations[$name]}"
    if [[ $count -gt 1 ]]; then
        # Check if any location is NOT in shared-types
        IFS=',' read -ra locs <<< "${locations[$name]}"
        non_shared_count=0
        for loc in "${locs[@]}"; do
            if [[ ! "$loc" =~ packages/shared-types ]]; then
                ((non_shared_count++))
            fi
        done
        
        # If more than one location is outside shared-types, it's a problem
        if [[ $non_shared_count -gt 1 ]]; then
            echo "❌ Duplicate type '$name' found in multiple packages:"
            for loc in "${locs[@]}"; do
                echo "   - $loc"
            done
            found_duplicates=true
        fi
    fi
done

if $found_duplicates; then
    echo ""
    echo "Error: Duplicate cross-package types detected. These should be moved to @vibe/shared-types"
    exit 1
else
    echo "✅ No problematic duplicate types found"
fi
#!/bin/bash

# Simple script to load environment variables from .env file
# Existing environment variables take precedence

# Load from .env file only if it exists
if [ -f ".env" ]; then
  echo "Loading additional environment variables from .env"
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]]; then
      continue
    fi
    
    # Extract variable name before the equals sign
    var_name=$(echo "$line" | cut -d= -f1)
    
    # Only export if not already defined in environment
    if [ -z "${!var_name}" ]; then
      export "$line"
    fi
  done < ".env"
fi

# Check if GITHUB_TOKEN is available (either from .env or pre-existing)
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Warning: GITHUB_TOKEN not found in environment or .env"
else
  echo "GITHUB_TOKEN is available"
fi
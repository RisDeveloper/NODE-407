#!/bin/bash
set -e

PORT=${PORT:-80}
echo "Starting Apache on port $PORT"

# Update Apache port
if [ -f /etc/apache2/ports.conf ]; then
  sed -i "s/Listen 80/Listen $PORT/g" /etc/apache2/ports.conf
fi

# Update virtual host
if [ -f /etc/apache2/sites-available/000-default.conf ]; then
  sed -i "s/:80>/:$PORT>/g" /etc/apache2/sites-available/000-default.conf
fi
if [ -f /etc/apache2/sites-enabled/000-default.conf ]; then
  sed -i "s/:80>/:$PORT>/g" /etc/apache2/sites-enabled/000-default.conf
fi

# Set ServerName
echo "ServerName localhost" >> /etc/apache2/apache2.conf

echo "Starting apache2-foreground..."
exec apache2-foreground

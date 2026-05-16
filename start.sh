#!/bin/bash
PORT=${PORT:-80}

# Update Apache port
sed -i "s/Listen 80/Listen $PORT/g" /etc/apache2/ports.conf

# Update virtual host if exists
if [ -f /etc/apache2/sites-available/000-default.conf ]; then
  sed -i "s/:80>/:$PORT>/g" /etc/apache2/sites-available/000-default.conf
fi
if [ -f /etc/apache2/sites-enabled/000-default.conf ]; then
  sed -i "s/:80>/:$PORT>/g" /etc/apache2/sites-enabled/000-default.conf
fi

exec apache2-foreground

FROM php:8.2-apache

# PostgreSQL PDO
RUN apt-get update && apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql

# Enable mod_rewrite
RUN a2enmod rewrite

# Copy project
COPY . /var/www/html/

# Custom entrypoint untuk Railway PORT
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Use env vars
ENV DB_HOST=db.lvveteqoidlcnmvuoupa.supabase.co
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=@Faris111029H
ENV DB_NAME=postgres

EXPOSE 80

CMD ["/start.sh"]

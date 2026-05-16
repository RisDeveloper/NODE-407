FROM php:8.2-apache

RUN apt-get update && apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql

# Fix MPM conflict
RUN a2dismod --force mpm_event mpm_worker 2>/dev/null; \
    a2enmod mpm_prefork rewrite; \
    echo "ServerName localhost" >> /etc/apache2/apache2.conf

COPY . /var/www/html/

ENV DB_HOST=db.lvveteqoidlcnmvuoupa.supabase.co
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=@Faris111029H
ENV DB_NAME=postgres
ENV APP_URL=https://node407.railway.app

EXPOSE 80

CMD ["apache2-foreground"]

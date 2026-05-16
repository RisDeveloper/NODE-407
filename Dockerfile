FROM php:8.2-apache

RUN apt-get update && apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql

# Force only mpm_prefork
RUN rm -f /etc/apache2/mods-enabled/mpm*.load /etc/apache2/mods-enabled/mpm*.conf && \
    ln -s /etc/apache2/mods-available/mpm_prefork.load /etc/apache2/mods-enabled/ && \
    ln -s /etc/apache2/mods-available/mpm_prefork.conf /etc/apache2/mods-enabled/ && \
    a2enmod rewrite && \
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

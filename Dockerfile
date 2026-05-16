FROM php:8.2-apache

RUN apt-get update && apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql
RUN a2enmod rewrite
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

COPY . /var/www/html/

ENV DB_HOST=db.lvveteqoidlcnmvuoupa.supabase.co
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=@Faris111029H
ENV DB_NAME=postgres

EXPOSE 80

CMD ["apache2-foreground"]
